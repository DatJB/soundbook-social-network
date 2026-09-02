package com.soundbook.repository;

import com.soundbook.entity.Follow;
import com.soundbook.entity.FollowId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface FollowRepository extends JpaRepository<Follow, FollowId> {
    List<Follow> findByIdFollowerId(Long followerId);

    List<Follow> findByIdFolloweeId(Long followeeId);

    boolean existsByIdFollowerIdAndIdFolloweeId(Long followerId, Long followeeId);

    long countByIdFollowerId(Long followerId);

    long countByIdFolloweeId(Long followeeId);

    @org.springframework.data.jpa.repository.Query("SELECT f FROM Follow f JOIN User u ON f.id.followerId = u.id " +
            "WHERE f.id.followeeId = :followeeId AND (LOWER(u.displayName) LIKE LOWER(CONCAT('%', :query, '%')) OR LOWER(u.email) LIKE LOWER(CONCAT('%', :query, '%')))")
    List<Follow> searchFollowers(@org.springframework.data.repository.query.Param("followeeId") Long followeeId, @org.springframework.data.repository.query.Param("query") String query);

    @org.springframework.data.jpa.repository.Query("SELECT f.id.followeeId FROM Follow f WHERE f.id.followerId = :viewerId AND f.id.followeeId IN :authorIds")
    java.util.Set<Long> findFollowedAuthorIds(
            @org.springframework.data.repository.query.Param("viewerId") Long viewerId,
            @org.springframework.data.repository.query.Param("authorIds") java.util.Collection<Long> authorIds);
}
