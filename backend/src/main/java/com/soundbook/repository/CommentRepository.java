package com.soundbook.repository;

import com.soundbook.entity.Comment;
import com.soundbook.entity.enums.CommentStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommentRepository extends JpaRepository<Comment, Long> {
//    long countByPostId(Long postId);
//
//    List<Comment> findByPostIdAndParentIsNullOrderByCreatedAtDesc(Long postId, Pageable pageable);

    @Query("SELECT COUNT(c) FROM Comment c WHERE c.post.id = :postId AND c.status <> com.soundbook.entity.enums.CommentStatus.DELETED")
    long countByPostId(@Param("postId") Long postId);

    long countByPost_IdAndParentIsNullAndStatusNot(Long postId, com.soundbook.entity.enums.CommentStatus status);

    @Query(value = "SELECT c FROM Comment c WHERE c.post.id = :postId AND c.parent IS NULL AND c.status <> com.soundbook.entity.enums.CommentStatus.DELETED ORDER BY c.createdAt DESC",
           countQuery = "SELECT COUNT(c) FROM Comment c WHERE c.post.id = :postId AND c.parent IS NULL AND c.status <> com.soundbook.entity.enums.CommentStatus.DELETED")
    org.springframework.data.domain.Page<Comment> findByPostIdAndParentIsNullOrderByCreatedAtDesc(@Param("postId") Long postId, org.springframework.data.domain.Pageable pageable);

    @Query("SELECT c FROM Comment c WHERE c.post.id = :postId AND c.parent IS NULL AND c.status <> com.soundbook.entity.enums.CommentStatus.DELETED ORDER BY c.createdAt DESC")
    List<Comment> findByPostIdAndParentIsNullOrderByCreatedAtDescList(@Param("postId") Long postId);

    @Query(value = "SELECT c FROM Comment c WHERE c.post.id = :postId AND c.parent IS NULL ORDER BY c.createdAt DESC",
           countQuery = "SELECT COUNT(c) FROM Comment c WHERE c.post.id = :postId AND c.parent IS NULL")
    org.springframework.data.domain.Page<Comment> findByPostIdAndParentIsNullOrderByCreatedAtDescAdmin(@Param("postId") Long postId, org.springframework.data.domain.Pageable pageable);

    @Query("SELECT c FROM Comment c WHERE c.parent.id = :parentId ORDER BY c.createdAt ASC")
    List<Comment> findByParent_IdOrderByCreatedAtAscAdmin(@Param("parentId") Long parentId);

    @Query("SELECT COUNT(c) FROM Comment c WHERE c.post.id = :postId")
    long countAllByPostId(@Param("postId") Long postId);
    
    @Query("SELECT COUNT(c) FROM Comment c WHERE c.parent.id = :parentId")
    long countAllByParentId(@Param("parentId") Long parentId);

    @Query("SELECT c FROM Comment c WHERE c.post.id = :postId AND c.status <> com.soundbook.entity.enums.CommentStatus.DELETED ORDER BY c.createdAt DESC")
    List<Comment> findByPostIdAndStatusNotDeletedOrderByCreatedAtDesc(@Param("postId") Long postId, Pageable pageable);

    void deleteByPostId(Long postId);

    Page<Comment> findByPostId(Long postId, Pageable pageable);
    
    long countByParent_IdAndStatusNot(Long parentId, com.soundbook.entity.enums.CommentStatus status);

    List<Comment> findByParent_IdAndStatusNotOrderByCreatedAtAsc(Long commentId, CommentStatus commentStatus);

    @Query("SELECT c.post.id AS postId, COUNT(c.id) AS total " +
           "FROM Comment c " +
           "WHERE c.post.id IN :postIds AND c.status <> :deletedStatus " +
           "GROUP BY c.post.id")
    java.util.List<com.soundbook.dto.feed.CommentCountProjection> countCommentsByPostIds(
            @Param("postIds") java.util.Collection<Long> postIds,
            @Param("deletedStatus") CommentStatus deletedStatus);
}
