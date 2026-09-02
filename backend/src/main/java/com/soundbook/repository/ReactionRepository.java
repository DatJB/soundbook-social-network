package com.soundbook.repository;

import com.soundbook.entity.Reaction;
import com.soundbook.entity.enums.ReactionType;
import com.soundbook.entity.enums.TargetType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ReactionRepository extends JpaRepository<Reaction, Long> {
    long countByTargetTypeAndTargetId(TargetType targetType, Long targetId);

    long countByTargetTypeAndTargetIdAndReactionType(TargetType targetType, Long targetId, ReactionType reactionType);

    Optional<Reaction> findByUser_IdAndTargetTypeAndTargetId(Long userId, TargetType targetType, Long targetId);

    void deleteByTargetTypeAndTargetId(TargetType targetType, Long targetId);

    @Query("SELECT r FROM Reaction r JOIN FETCH r.user u LEFT JOIN FETCH u.profile " +
           "WHERE r.targetId = :targetId AND r.targetType = :targetType")
    Page<Reaction> findByTargetIdAndTargetType(@Param("targetId") Long targetId,
                                               @Param("targetType") com.soundbook.entity.enums.TargetType targetType,
                                               Pageable pageable);

    long countByTargetIdAndTargetType(Long targetId, TargetType targetType);
    
    @Query("SELECT DISTINCT r.reactionType FROM Reaction r WHERE r.targetId = :targetId AND r.targetType = :targetType")
    java.util.List<ReactionType> findDistinctReactionTypesByTargetIdAndTargetType(@Param("targetId") Long targetId, @Param("targetType") TargetType targetType);

    Optional<Reaction> findByUserIdAndTargetIdAndTargetType(Long userId, Long targetId, TargetType targetType);

    @Query("SELECT r.targetId AS targetId, r.reactionType AS reactionType, COUNT(r.id) AS total " +
           "FROM Reaction r " +
           "WHERE r.targetType = :targetType AND r.targetId IN :postIds " +
           "GROUP BY r.targetId, r.reactionType")
    java.util.List<com.soundbook.dto.feed.ReactionSummaryProjection> findReactionSummary(
            @Param("targetType") TargetType targetType,
            @Param("postIds") java.util.Collection<Long> postIds);

    @Query("SELECT r FROM Reaction r " +
           "WHERE r.user.id = :viewerId AND r.targetType = :targetType AND r.targetId IN :postIds")
    java.util.List<Reaction> findViewerReactions(
            @Param("viewerId") Long viewerId,
            @Param("targetType") TargetType targetType,
            @Param("postIds") java.util.Collection<Long> postIds);
}
