package com.soundbook.repository;

import com.soundbook.entity.FriendRequest;
import com.soundbook.entity.enums.FriendRequestStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface FriendRequestRepository extends JpaRepository<FriendRequest, Long> {
    Optional<FriendRequest> findFirstByRequester_IdAndReceiver_IdOrderByCreatedAtDesc(Long requesterId, Long receiverId);

    Optional<FriendRequest> findFirstByRequester_IdAndReceiver_IdAndStatus(Long requesterId, Long receiverId, FriendRequestStatus status);

    List<FriendRequest> findByReceiver_IdAndStatusOrderByCreatedAtDesc(Long receiverId, FriendRequestStatus status);

    List<FriendRequest> findByRequester_IdAndStatusOrderByCreatedAtDesc(Long requesterId, FriendRequestStatus status);

    @Query("SELECT fr FROM FriendRequest fr WHERE fr.status = :status AND " +
           "((fr.requester.id = :userId AND fr.receiver.id IN :candidateIds) OR " +
           "(fr.receiver.id = :userId AND fr.requester.id IN :candidateIds))")
    List<FriendRequest> findActiveRequestsIn(
            @Param("userId") Long userId,
            @Param("candidateIds") Collection<Long> candidateIds,
            @Param("status") FriendRequestStatus status
    );
}
