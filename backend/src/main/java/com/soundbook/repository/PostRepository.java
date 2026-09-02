package com.soundbook.repository;

import com.soundbook.entity.Post;
import com.soundbook.entity.enums.Visibility;
import com.soundbook.entity.Reaction;
import com.soundbook.entity.enums.ReactionType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

@Repository
public interface PostRepository extends JpaRepository<Post, Long> {
//    List<Post> findByVisibilityOrderByCreatedAtDesc(Visibility visibility, Pageable pageable);
//
//    List<Post> findByUser_IdInAndVisibilityInOrderByCreatedAtDesc(
//            Collection<Long> userIds,
//            Collection<Visibility> visibilities,
//            Pageable pageable
//    );
//
//    List<Post> findByUser_IdOrderByCreatedAtDesc(Long userId, Pageable pageable);
//
//    long countByUser_Id(Long userId);

    @Query("SELECT p FROM Post p WHERE p.visibility = :visibility AND p.status NOT IN ('HIDDEN', 'DELETED') ORDER BY p.createdAt DESC, p.id DESC")
    List<Post> findByVisibilityOrderByCreatedAtDesc(Visibility visibility, Pageable pageable);

    @Query("SELECT p FROM Post p WHERE p.user.id IN :userIds AND p.visibility IN :visibilities AND p.status NOT IN ('HIDDEN', 'DELETED') ORDER BY p.createdAt DESC, p.id DESC")
    List<Post> findByUser_IdInAndVisibilityInOrderByCreatedAtDesc(Collection<Long> userIds, Collection<Visibility> visibilities, Pageable pageable);

    @Query("SELECT p FROM Post p WHERE p.user.id = :userId AND p.status NOT IN ('HIDDEN', 'DELETED') ORDER BY p.createdAt DESC, p.id DESC")
    List<Post> findByUser_IdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    @Query("SELECT COUNT(p) FROM Post p WHERE p.user.id = :userId AND p.status  NOT IN ('HIDDEN', 'DELETED')")
    long countByUser_Id(Long userId);

    @Query("""
            select p
            from Post p
            where p.visibility = :visibility AND p.status NOT IN ('HIDDEN', 'DELETED')
              and (
                lower(coalesce(p.caption, '')) like lower(concat('%', :keyword, '%'))
                or lower(coalesce(p.contentRich, '')) like lower(concat('%', :keyword, '%'))
                or lower(coalesce(p.refJson, '')) like lower(concat('%', :keyword, '%'))
                or lower(coalesce(p.moodTag, '')) like lower(concat('%', :keyword, '%'))
              )
            order by p.createdAt desc
            """)
    List<Post> searchPublicPosts(@Param("keyword") String keyword, @Param("visibility") Visibility visibility, Pageable pageable);

    @Query(value = "SELECT p FROM Post p JOIN FETCH p.user u " +
            "WHERE (:keyword IS NULL OR :keyword = '') " +
            "OR LOWER(u.displayName) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
            "OR LOWER(u.email) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
            "OR LOWER(p.caption) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
            "OR CAST(p.id AS string) = :keyword",
            countQuery = "SELECT COUNT(p) FROM Post p JOIN p.user u " +
                    "WHERE :keyword IS NULL OR :keyword = '' " +
                    "OR LOWER(u.displayName) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
                    "OR LOWER(u.email) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
                    "OR LOWER(p.caption) LIKE LOWER(CONCAT('%', :keyword, '%')) " +
                    "OR CAST(p.id AS string) = :keyword")
    Page<Post> searchAllWithAuthor(@Param("keyword") String keyword, Pageable pageable);

    long countByCreatedAtBetween(LocalDateTime start, LocalDateTime end);

    @Query("SELECT p FROM Post p JOIN FETCH p.user u LEFT JOIN FETCH u.profile " +
            "WHERE p.status NOT IN ('HIDDEN', 'DELETED') " +
            "ORDER BY (SELECT COUNT(c) FROM Comment c WHERE c.post.id = p.id) DESC")
    List<Post> findTrendingPosts(Pageable pageable);
}
