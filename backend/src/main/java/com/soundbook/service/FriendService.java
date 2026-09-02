package com.soundbook.service;

import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.social.FriendActionResponse;
import com.soundbook.dto.social.FriendListResponse;
import com.soundbook.dto.social.FriendUserResponse;
import com.soundbook.dto.taste.MatchUserResponse;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.FriendRequestStatus;
import com.soundbook.entity.enums.NotificationType;
import com.soundbook.entity.enums.TargetType;
import com.soundbook.event.NotificationEvent;
import com.soundbook.messaging.NotificationProducer;
import com.soundbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FriendService {

    private static final String STATUS_SELF = "SELF";
    private static final String STATUS_FRIENDS = "FRIENDS";
    private static final String STATUS_INCOMING = "INCOMING_REQUEST";
    private static final String STATUS_OUTGOING = "OUTGOING_REQUEST";
    private static final String STATUS_NONE = "NONE";

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final FriendshipRepository friendshipRepository;
    private final FriendRequestRepository friendRequestRepository;
    private final DmThreadRepository dmThreadRepository;
    private final NotificationProducer notificationProducer;
    private final TasteDnaService tasteDnaService;

    @Transactional(readOnly = true)
    public FriendListResponse getFriendHub(String email) {
        User currentUser = findUserByEmail(email);
        Long currentUserId = currentUser.getId();

        // 1. Friendships (1 query)
        List<Friendship> friendships = friendshipRepository.findByIdUserIdOrderByCreatedAtDesc(currentUserId);

        // 2. Incoming requests (1 query)
        List<FriendRequest> incomingRequests = friendRequestRepository
                .findByReceiver_IdAndStatusOrderByCreatedAtDesc(currentUserId, FriendRequestStatus.PENDING);

        // 3. Outgoing requests (1 query)
        List<FriendRequest> outgoingRequests = friendRequestRepository
                .findByRequester_IdAndStatusOrderByCreatedAtDesc(currentUserId, FriendRequestStatus.PENDING);

        // 4. Batch UserProfiles (1 query)
        Set<Long> allUserIds = new HashSet<>();
        friendships.forEach(f -> allUserIds.add(f.getFriend().getId()));
        incomingRequests.forEach(r -> allUserIds.add(r.getRequester().getId()));
        outgoingRequests.forEach(r -> allUserIds.add(r.getReceiver().getId()));

        Map<Long, UserProfile> profileMap = allUserIds.isEmpty() ? Collections.emptyMap() :
                userProfileRepository.findAllById(allUserIds).stream()
                        .collect(Collectors.toMap(UserProfile::getUserId, Function.identity(), (a, b) -> a));

        // 5. In-memory mapping (0 database queries)
        List<FriendUserResponse> friends = friendships.stream().map(f -> {
            User friend = f.getFriend();
            UserProfile profile = profileMap.get(friend.getId());
            return FriendUserResponse.builder()
                    .userId(friend.getId())
                    .displayName(friend.getDisplayName())
                    .username(profile != null ? profile.getUsername() : null)
                    .avatarUrl(profile != null ? profile.getAvatarUrl() : null)
                    .bio(profile != null ? profile.getBio() : null)
                    .friendshipStatus(STATUS_FRIENDS)
                    .canMessage(true)
                    .connectedAt(f.getCreatedAt())
                    .build();
        }).toList();

        List<FriendUserResponse> incoming = incomingRequests.stream().map(r -> {
            User requester = r.getRequester();
            UserProfile profile = profileMap.get(requester.getId());
            return FriendUserResponse.builder()
                    .userId(requester.getId())
                    .displayName(requester.getDisplayName())
                    .username(profile != null ? profile.getUsername() : null)
                    .avatarUrl(profile != null ? profile.getAvatarUrl() : null)
                    .bio(profile != null ? profile.getBio() : null)
                    .friendshipStatus(STATUS_INCOMING)
                    .requestId(r.getId())
                    .canMessage(false)
                    .connectedAt(r.getCreatedAt())
                    .build();
        }).toList();

        List<FriendUserResponse> outgoing = outgoingRequests.stream().map(r -> {
            User receiver = r.getReceiver();
            UserProfile profile = profileMap.get(receiver.getId());
            return FriendUserResponse.builder()
                    .userId(receiver.getId())
                    .displayName(receiver.getDisplayName())
                    .username(profile != null ? profile.getUsername() : null)
                    .avatarUrl(profile != null ? profile.getAvatarUrl() : null)
                    .bio(profile != null ? profile.getBio() : null)
                    .friendshipStatus(STATUS_OUTGOING)
                    .requestId(r.getId())
                    .canMessage(false)
                    .connectedAt(r.getCreatedAt())
                    .build();
        }).toList();

        return FriendListResponse.builder()
                .friends(friends)
                .incomingRequests(incoming)
                .outgoingRequests(outgoing)
                .suggestions(Collections.emptyList())
                .build();
    }

    @Transactional
    public FriendActionResponse sendRequest(String email, Long receiverId) {
        User requester = findUserByEmail(email);
        User receiver = findUser(receiverId);
        if (Objects.equals(requester.getId(), receiver.getId())) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        if (isFriends(requester.getId(), receiver.getId())) {
            Long threadId = upsertDmThread(requester, receiver).getId();
            return action(receiver.getId(), STATUS_FRIENDS, null, threadId, true, "Hai bạn đã là bạn bè.");
        }

        Optional<FriendRequest> reversePending = friendRequestRepository
                .findFirstByRequester_IdAndReceiver_IdAndStatus(receiver.getId(), requester.getId(), FriendRequestStatus.PENDING);
        if (reversePending.isPresent()) {
            return acceptRequest(email, reversePending.get().getId());
        }

        Optional<FriendRequest> existing = friendRequestRepository.findFirstByRequester_IdAndReceiver_IdOrderByCreatedAtDesc(requester.getId(), receiver.getId());
        if (existing.isPresent()) {
            FriendRequest request = existing.get();
            if (request.getStatus() == FriendRequestStatus.PENDING) {
                return action(receiver.getId(), STATUS_OUTGOING, request.getId(), null, false, "Lời mời kết bạn đang chờ phản hồi.");
            }
            request.setStatus(FriendRequestStatus.PENDING);
            FriendRequest saved = friendRequestRepository.save(request);
            notifyFriendRequest(receiver, requester, saved.getId());
            return action(receiver.getId(), STATUS_OUTGOING, saved.getId(), null, false, "Đã gửi lại lời mời kết bạn.");
        }

        FriendRequest saved = friendRequestRepository.save(FriendRequest.builder()
                .requester(requester)
                .receiver(receiver)
                .status(FriendRequestStatus.PENDING)
                .build());
        notifyFriendRequest(receiver, requester, saved.getId());
        return action(receiver.getId(), STATUS_OUTGOING, saved.getId(), null, false, "Đã gửi lời mời kết bạn.");
    }

    @Transactional
    public FriendActionResponse acceptRequest(String email, Long requestId) {
        User currentUser = findUserByEmail(email);
        FriendRequest request = friendRequestRepository.findById(requestId)
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        if (!Objects.equals(request.getReceiver().getId(), currentUser.getId())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        if (request.getStatus() != FriendRequestStatus.PENDING && request.getStatus() != FriendRequestStatus.ACCEPTED) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }

        request.setStatus(FriendRequestStatus.ACCEPTED);
        friendRequestRepository.save(request);
        createFriendshipPair(request.getRequester(), request.getReceiver());
        DmThread thread = upsertDmThread(request.getRequester(), request.getReceiver());
        notifyAccepted(request.getRequester(), request.getReceiver(), thread.getId());
        return action(request.getRequester().getId(), STATUS_FRIENDS, request.getId(), thread.getId(), true, "Đã chấp nhận lời mời kết bạn.");
    }

    @Transactional
    public FriendActionResponse declineRequest(String email, Long requestId) {
        User currentUser = findUserByEmail(email);
        FriendRequest request = friendRequestRepository.findById(requestId)
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        if (!Objects.equals(request.getReceiver().getId(), currentUser.getId())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        request.setStatus(FriendRequestStatus.DECLINED);
        friendRequestRepository.save(request);
        return action(request.getRequester().getId(), STATUS_NONE, request.getId(), null, false, "Đã từ chối lời mời kết bạn.");
    }

    @Transactional
    public FriendActionResponse cancelRequest(String email, Long requestId) {
        User currentUser = findUserByEmail(email);
        FriendRequest request = friendRequestRepository.findById(requestId)
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        if (!Objects.equals(request.getRequester().getId(), currentUser.getId())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        request.setStatus(FriendRequestStatus.CANCELLED);
        friendRequestRepository.save(request);
        return action(request.getReceiver().getId(), STATUS_NONE, request.getId(), null, false, "Đã hủy lời mời kết bạn.");
    }

    @Transactional
    public FriendActionResponse removeFriend(String email, Long friendId) {
        User currentUser = findUserByEmail(email);
        User friend = findUser(friendId);
        friendshipRepository.deleteById(new FriendshipId(currentUser.getId(), friend.getId()));
        friendshipRepository.deleteById(new FriendshipId(friend.getId(), currentUser.getId()));
        return action(friend.getId(), STATUS_NONE, null, null, false, "Đã hủy kết bạn.");
    }

    @Transactional
    public FriendActionResponse startChat(String email, Long friendId) {
        User currentUser = findUserByEmail(email);
        User friend = findUser(friendId);
        if (!isFriends(currentUser.getId(), friend.getId())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        DmThread thread = upsertDmThread(currentUser, friend);
        return action(friend.getId(), STATUS_FRIENDS, null, thread.getId(), true, "Đã mở cuộc trò chuyện.");
    }

    @Transactional(readOnly = true)
    public FriendUserResponse buildFriendUser(String requesterEmail, User target) {
        User requester = findUserByEmail(requesterEmail);
        return toFriendUserResponse(requester, target, null);
    }

    @Transactional(readOnly = true)
    public String friendshipStatus(Long requesterId, Long targetId) {
        return resolveStatus(requesterId, targetId).status();
    }

    @Transactional(readOnly = true)
    public Long friendRequestId(Long requesterId, Long targetId) {
        return resolveStatus(requesterId, targetId).requestId();
    }

    @Transactional(readOnly = true)
    public boolean canMessage(Long requesterId, Long targetId) {
        return isFriends(requesterId, targetId);
    }

    private FriendUserResponse toFriendUserResponse(User requester, User target, LocalDateTime connectedAt) {
        UserProfile profile = userProfileRepository.findById(target.getId()).orElse(null);
        StatusSnapshot status = resolveStatus(requester.getId(), target.getId());
        MatchUserResponse match = null;
        try {
            match = tasteDnaService.getMatchWithUser(requester.getEmail(), target.getId());
        } catch (Exception ignored) {
            // Taste DNA is optional for search/profile/friends; do not fail social UI.
        }

        return FriendUserResponse.builder()
                .userId(target.getId())
                .displayName(target.getDisplayName())
                .username(profile == null ? null : profile.getUsername())
                .avatarUrl(profile == null ? null : profile.getAvatarUrl())
                .bio(profile == null ? null : profile.getBio())
                .matchScore(match == null ? 0 : match.getFinalMatch())
                .sharedFeatures(match == null ? List.of() : match.getSharedFeatures())
                .friendshipStatus(status.status())
                .requestId(status.requestId())
                .canMessage(STATUS_FRIENDS.equals(status.status()))
                .connectedAt(connectedAt)
                .build();
    }

    private FriendUserResponse withRequest(FriendUserResponse response, Long requestId, String status) {
        response.setRequestId(requestId);
        response.setFriendshipStatus(status);
        response.setCanMessage(false);
        return response;
    }

    private StatusSnapshot resolveStatus(Long requesterId, Long targetId) {
        if (Objects.equals(requesterId, targetId)) {
            return new StatusSnapshot(STATUS_SELF, null);
        }
        if (isFriends(requesterId, targetId)) {
            return new StatusSnapshot(STATUS_FRIENDS, null);
        }
        Optional<FriendRequest> outgoing = friendRequestRepository
                .findFirstByRequester_IdAndReceiver_IdAndStatus(requesterId, targetId, FriendRequestStatus.PENDING);
        if (outgoing.isPresent()) {
            return new StatusSnapshot(STATUS_OUTGOING, outgoing.get().getId());
        }
        Optional<FriendRequest> incoming = friendRequestRepository
                .findFirstByRequester_IdAndReceiver_IdAndStatus(targetId, requesterId, FriendRequestStatus.PENDING);
        if (incoming.isPresent()) {
            return new StatusSnapshot(STATUS_INCOMING, incoming.get().getId());
        }
        return new StatusSnapshot(STATUS_NONE, null);
    }

    private void createFriendshipPair(User a, User b) {
        if (!isFriends(a.getId(), b.getId())) {
            friendshipRepository.save(Friendship.builder()
                    .id(new FriendshipId(a.getId(), b.getId()))
                    .user(a)
                    .friend(b)
                    .build());
            friendshipRepository.save(Friendship.builder()
                    .id(new FriendshipId(b.getId(), a.getId()))
                    .user(b)
                    .friend(a)
                    .build());
        }
    }

    private DmThread upsertDmThread(User user, User peer) {
        long user1Id = Math.min(user.getId(), peer.getId());
        long user2Id = Math.max(user.getId(), peer.getId());
        return dmThreadRepository.findByUser1_IdAndUser2_Id(user1Id, user2Id)
                .orElseGet(() -> dmThreadRepository.save(DmThread.builder()
                        .user1(user1Id == user.getId() ? user : peer)
                        .user2(user2Id == user.getId() ? user : peer)
                        .build()));
    }

    private boolean isFriends(Long userId, Long friendId) {
        return friendshipRepository.existsByIdUserIdAndIdFriendId(userId, friendId);
    }

    private void notifyFriendRequest(User receiver, User requester, Long requestId) {
        notificationProducer.publish(
                new NotificationEvent(
                        receiver.getId(),
                        requester.getId(),
                        NotificationType.FRIEND_REQUEST,
                        TargetType.USER,
                        requestId,
                        requester.getDisplayName() + " đã gửi lời mời kết bạn."
                )
        );
    }

    private void notifyAccepted(User requester, User receiver, Long threadId) {
        notificationProducer.publish(
                new NotificationEvent(
                        requester.getId(),
                        receiver.getId(),
                        NotificationType.FRIEND_REQUEST,
                        TargetType.DM_THREAD,
                        threadId,
                        receiver.getDisplayName() + " đã chấp nhận lời mời kết bạn. Hai bạn có thể nhắn tin với nhau."
                )
        );
    }

    private FriendActionResponse action(Long userId, String status, Long requestId, Long dmThreadId, boolean canMessage, String message) {
        return FriendActionResponse.builder()
                .userId(userId)
                .friendshipStatus(status)
                .requestId(requestId)
                .dmThreadId(dmThreadId)
                .canMessage(canMessage)
                .message(message)
                .build();
    }

    private User findUserByEmail(String email) {
        return userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private User findUser(Long userId) {
        return userRepository.findById(userId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private record StatusSnapshot(String status, Long requestId) {}
}
