package com.soundbook.repository;

import com.soundbook.entity.Friendship;
import com.soundbook.entity.FriendshipId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Set;

@Repository
public interface FriendshipRepository extends JpaRepository<Friendship, FriendshipId> {
    boolean existsByIdUserIdAndIdFriendId(Long userId, Long friendId);

    List<Friendship> findByIdUserIdOrderByCreatedAtDesc(Long userId);

    List<Friendship> findByIdUserIdOrderByCreatedAtDesc(Long userId, org.springframework.data.domain.Pageable pageable);

    long countByIdUserId(Long userId);

    @Query("SELECT f.id.friendId FROM Friendship f WHERE f.id.userId = :userId AND f.id.friendId IN :candidateIds")
    Set<Long> findFriendIdsIn(@Param("userId") Long userId, @Param("candidateIds") Collection<Long> candidateIds);
}
