package com.soundbook.service.impl;

import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.room.*;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.RoomRole;
import com.soundbook.entity.enums.RoomStatus;
import com.soundbook.repository.*;
import com.soundbook.service.RoomService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class RoomServiceImpl implements RoomService {

    private final RoomRepository roomRepository;
    private final RoomMemberRepository roomMemberRepository;
    private final RoomPlaybackStateRepository roomPlaybackStateRepository;
    private final RoomMessageRepository roomMessageRepository;
    private final RoomQueueRepository roomQueueRepository;
    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Override
    public RoomDetailResponse createRoom(CreateRoomRequest request) {
        User host = userRepository.findById(request.getHostUserId())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Room room = Room.builder()
                .host(host)
                .name(request.getName())
                .topic(request.getTopic())
                .isPublic(request.getIsPublic() == null ? Boolean.TRUE : request.getIsPublic())
                .status(RoomStatus.LIVE)
                .build();
        Room savedRoom = roomRepository.save(room);

        RoomMember hostMember = RoomMember.builder()
                .id(new RoomMemberId(savedRoom.getId(), host.getId()))
                .room(savedRoom)
                .user(host)
                .role(RoomRole.HOST)
                .leftAt(null)
                .build();
        roomMemberRepository.save(hostMember);

        RoomPlaybackState playbackState = RoomPlaybackState.builder()
                .room(savedRoom)
                .trackId(null)
                .trackPayloadJson(null)
                .positionMs(0)
                .isPlaying(false)
                .updatedBy(host)
                .build();
        roomPlaybackStateRepository.save(playbackState);

        return buildRoomDetail(savedRoom);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ActiveRoomResponse> getActiveRooms(int limit) {
        int sanitizedLimit = Math.max(1, Math.min(limit, 100));
        List<Room> rooms = roomRepository.findByStatusOrderByCreatedAtDesc(RoomStatus.LIVE, PageRequest.of(0, sanitizedLimit));

        List<Long> hostIds = rooms.stream().map(room -> room.getHost().getId()).toList();
        Map<Long, UserProfile> profileByUserId = userProfileRepository.findAllById(hostIds)
                .stream()
                .collect(Collectors.toMap(UserProfile::getUserId, Function.identity()));

        return rooms.stream().map(room -> {
            long listeners = roomMemberRepository.countByRoom_IdAndLeftAtIsNull(room.getId());
            UserProfile hostProfile = profileByUserId.get(room.getHost().getId());
            RoomPlaybackState state = roomPlaybackStateRepository.findById(room.getId()).orElse(null);
            return ActiveRoomResponse.builder()
                    .roomId(room.getId())
                    .name(room.getName())
                    .topic(room.getTopic())
                    .hostUserId(room.getHost().getId())
                    .hostDisplayName(room.getHost().getDisplayName())
                    .hostAvatarUrl(hostProfile != null ? hostProfile.getAvatarUrl() : null)
                    .listenersCount(listeners)
                    .status(room.getStatus().name())
                    .createdAt(room.getCreatedAt())
                    .state(toStateResponse(state))
                    .build();
        }).toList();
    }

    @Override
    public RoomDetailResponse joinRoom(Long roomId, Long userId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        if (room.getStatus() == RoomStatus.ENDED) {
            // Allow host to reopen the room if they accidentally left,
            // but ONLY if it wasn't forcibly closed by an admin.
            if (room.getHost().getId().equals(userId) && !Boolean.TRUE.equals(room.getIsClosedByAdmin())) {
                room.setStatus(RoomStatus.LIVE);
                room.setEndedAt(null);
                roomRepository.save(room);
            } else {
                throw new AppException(ErrorCode.ROOM_ALREADY_ENDED);
            }
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        RoomMemberId memberId = new RoomMemberId(roomId, userId);
        RoomMember roomMember = roomMemberRepository.findById(memberId).orElse(null);

        if (roomMember != null && roomMember.getLeftAt() == null && roomMember.getRole() != RoomRole.PENDING) {
            throw new AppException(ErrorCode.ROOM_ALREADY_JOINED);
        }

        if (roomMember != null && roomMember.isBanned()) {
            throw new AppException(ErrorCode.UNAUTHORIZED); // Or ROOM_BANNED
        }

        RoomRole roleToAssign = room.getIsPublic() ? RoomRole.MEMBER : RoomRole.PENDING;

        if (roomMember == null) {
            roomMember = RoomMember.builder()
                    .id(memberId)
                    .room(room)
                    .user(user)
                    .role(roleToAssign)
                    .leftAt(room.getIsPublic() ? null : LocalDateTime.now()) // If pending, pretend they are not actively in the room yet by leaving leftAt non-null? Or better yet, we just rely on PENDING role to hide them from listeners count!
                    .build();
            // Actually let's keep leftAt = null but they are PENDING. Listeners count must filter out PENDING!
            // Wait, leftAt = null means they are actively requesting.
            roomMember.setLeftAt(null);
        } else {
            roomMember.setLeftAt(null);
            // If they are not the current host of the room, they cannot be HOST anymore!
            // Even if they were the old host, their role must be downgraded.
            roomMember.setRole(roleToAssign);
        }

        roomMemberRepository.save(roomMember);
        return buildRoomDetail(room);
    }

    @Override
    public RoomDetailResponse leaveRoom(Long roomId, Long userId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));

        RoomMember roomMember = roomMemberRepository.findById(new RoomMemberId(roomId, userId))
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));

        if (roomMember.getLeftAt() != null) {
            throw new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND);
        }

        LocalDateTime now = LocalDateTime.now();
        roomMember.setLeftAt(now);
        roomMemberRepository.save(roomMember);

                if (roomMember.getRole() == RoomRole.HOST && room.getStatus() == RoomStatus.LIVE) {
                        // If host leaves, try to promote the next active member to HOST.
                        List<RoomMember> activeMembers = roomMemberRepository.findByRoom_IdAndLeftAtIsNull(roomId);

                        // Remove the leaving host from activeMembers list
                        activeMembers = activeMembers.stream()
                                        .filter(m -> !m.getUser().getId().equals(userId))
                                        .sorted((a, b) -> a.getJoinedAt().compareTo(b.getJoinedAt()))
                                        .toList();

                        if (activeMembers.isEmpty()) {
                                endRoom(room, now);
                        } else {
                                // Promote the earliest joined member to HOST
                                RoomMember newHost = activeMembers.get(0);
                                newHost.setRole(RoomRole.HOST);
                                roomMemberRepository.save(newHost);
                        }
                } else if (room.getStatus() == RoomStatus.LIVE) {
                        // Non-host member left — check if the room is now empty
                        List<RoomMember> remaining = roomMemberRepository.findByRoom_IdAndLeftAtIsNull(roomId);
                        boolean noOneLeft = remaining.stream().noneMatch(m -> !m.getUser().getId().equals(userId));
                        if (noOneLeft) {
                                endRoom(room, now);
                        }
                }

        return buildRoomDetail(room);
    }

    /** Centralized helper: mark room ENDED and broadcast event via STOMP */
    private void endRoom(Room room, LocalDateTime now) {
        room.setStatus(RoomStatus.ENDED);
        room.setEndedAt(now);
        roomRepository.save(room);
        // Notify all clients (including mini players on other pages) that this room has ended
        messagingTemplate.convertAndSend(
            "/topic/rooms/" + room.getId() + "/status",
            java.util.Map.of("status", "ENDED", "roomId", room.getId())
        );
    }


    @Override
    @Transactional(readOnly = true)
    public RoomDetailResponse getRoomDetail(Long roomId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        return buildRoomDetail(room);
    }

    @Override
    @Transactional(readOnly = true)
    public RoomPlaybackStateResponse getRoomState(Long roomId) {
        RoomPlaybackState state = roomPlaybackStateRepository.findById(roomId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        return toStateResponse(state);
    }

    private RoomDetailResponse buildRoomDetail(Room room) {
        List<RoomMember> activeMembers = roomMemberRepository.findByRoom_IdAndLeftAtIsNull(room.getId());
        List<Long> userIds = activeMembers.stream().map(member -> member.getUser().getId()).toList();
        Map<Long, UserProfile> profileByUserId = userProfileRepository.findAllById(userIds)
                .stream()
                .collect(Collectors.toMap(UserProfile::getUserId, Function.identity()));

        List<RoomMemberResponse> members = activeMembers.stream()
                .filter(m -> m.getRole() != RoomRole.PENDING)
                .map(member -> {
                    UserProfile profile = profileByUserId.get(member.getUser().getId());
                    return RoomMemberResponse.builder()
                            .userId(member.getUser().getId())
                            .displayName(member.getUser().getDisplayName())
                            .avatarUrl(profile != null ? profile.getAvatarUrl() : null)
                            .role(member.getRole().name())
                            .build();
                })
                .toList();

        List<RoomMemberResponse> pendingMembers = activeMembers.stream()
                .filter(m -> m.getRole() == RoomRole.PENDING)
                .map(member -> {
                    UserProfile profile = profileByUserId.get(member.getUser().getId());
                    return RoomMemberResponse.builder()
                            .userId(member.getUser().getId())
                            .displayName(member.getUser().getDisplayName())
                            .avatarUrl(profile != null ? profile.getAvatarUrl() : null)
                            .role(member.getRole().name())
                            .build();
                })
                .toList();

        RoomPlaybackState state = roomPlaybackStateRepository.findById(room.getId()).orElse(null);

        return RoomDetailResponse.builder()
                .roomId(room.getId())
                .name(room.getName())
                .topic(room.getTopic())
                .isPublic(room.getIsPublic())
                .status(room.getStatus().name())
                .hostUserId(room.getHost().getId())
                .hostDisplayName(room.getHost().getDisplayName())
                .createdAt(room.getCreatedAt())
                .endedAt(room.getEndedAt())
                .listenersCount((long) members.size())
                .state(toStateResponse(state))
                .members(members)
                .pendingMembers(pendingMembers)
                .build();
    }

    private RoomPlaybackStateResponse toStateResponse(RoomPlaybackState state) {
        if (state == null) {
            return null;
        }
        return RoomPlaybackStateResponse.builder()
                .trackId(state.getTrackId())
                .trackPayloadJson(state.getTrackPayloadJson())
                .positionMs(state.getPositionMs())
                .isPlaying(state.getIsPlaying())
                .updatedAt(state.getUpdatedAt())
                .updatedByUserId(state.getUpdatedBy() != null ? state.getUpdatedBy().getId() : null)
                .build();
    }

    @Override
    public RoomMessageResponse sendRoomMessage(Long roomId, RoomMessageSendRequest request) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        
        User sender = userRepository.findById(request.getSenderUserId())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        RoomMessage message = RoomMessage.builder()
                .room(room)
                .sender(sender)
                .contentText(request.getContentText())
                .build();
        
        RoomMessage savedMessage = roomMessageRepository.save(message);
        
        return RoomMessageResponse.builder()
                .messageId(savedMessage.getId())
                .roomId(savedMessage.getRoom().getId())
                .senderUserId(savedMessage.getSender().getId())
                .senderDisplayName(savedMessage.getSender().getDisplayName())
                .senderAvatarUrl(userProfileRepository.findById(savedMessage.getSender().getId())
                        .map(UserProfile::getAvatarUrl)
                        .orElse(null))
                .contentText(savedMessage.getContentText())
                .createdAt(savedMessage.getCreatedAt())
                .build();
    }

    @Override
    public RoomPlaybackStateResponse updatePlaybackState(Long roomId, RoomPlaybackUpdateRequest request) {
        RoomPlaybackState state = roomPlaybackStateRepository.findById(roomId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        
        User updatedBy = userRepository.findById(request.getUpdatedByUserId())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        state.setTrackId(request.getTrackId());
        state.setTrackPayloadJson(request.getTrackPayloadJson());
        state.setPositionMs(request.getPositionMs());
        state.setIsPlaying(request.getIsPlaying());
        state.setUpdatedBy(updatedBy);
        
        RoomPlaybackState updated = roomPlaybackStateRepository.save(state);
        return toStateResponse(updated);
    }

    @Override
    public RoomQueueItemResponse addToQueue(Long roomId, RoomQueueAddRequest request) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        
        User addedBy = userRepository.findById(request.getAddedByUserId())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Integer maxOrder = roomQueueRepository.findMaxPositionOrderByRoomId(roomId)
                .orElse(-1);
        
        RoomQueueItem item = RoomQueueItem.builder()
                .room(room)
                .trackId(request.getTrackId())
                .trackPayloadJson(request.getTrackPayloadJson())
                .addedBy(addedBy)
                .voteCount(0)
                .positionOrder(maxOrder + 1)
                .build();
        
        RoomQueueItem saved = roomQueueRepository.save(item);
        return toQueueItemResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RoomQueueItemResponse> getRoomQueue(Long roomId) {
        List<RoomQueueItem> items = roomQueueRepository.findByRoom_IdOrderByPlayedAtDescPositionOrderAsc(roomId);
        
        return items.stream().map(this::toQueueItemResponse).toList();
    }

    @Override
    public RoomQueueItemResponse voteQueueItem(Long queueItemId) {
        RoomQueueItem item = roomQueueRepository.findById(queueItemId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_QUEUE_ITEM_NOT_FOUND));

        item.setVoteCount(item.getVoteCount() + 1);
        RoomQueueItem saved = roomQueueRepository.save(item);
        return toQueueItemResponse(saved);
    }


    private RoomQueueItemResponse toQueueItemResponse(RoomQueueItem item) {
        return RoomQueueItemResponse.builder()
                .id(item.getId())
                .roomId(item.getRoom().getId())
                .trackId(item.getTrackId())
                .trackPayloadJson(item.getTrackPayloadJson())
                .addedByUserId(item.getAddedBy().getId())
                .addedByDisplayName(item.getAddedBy().getDisplayName())
                .voteCount(item.getVoteCount())
                .positionOrder(item.getPositionOrder())
                .playedAt(item.getPlayedAt())
                .createdAt(item.getCreatedAt())
                .build();
    }

    @Override
    public void removeQueueItem(Long roomId, Long queueItemId) {
        RoomQueueItem item = roomQueueRepository.findById(queueItemId)
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_QUEUE_ITEM_NOT_FOUND));
        
        if (!item.getRoom().getId().equals(roomId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        
        roomQueueRepository.delete(item);
    }

    @Override
    public void kickMember(Long roomId, Long targetUserId, Long hostUserId) {
        Room room = roomRepository.findById(roomId).orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        if (!room.getHost().getId().equals(hostUserId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        
        RoomMember target = roomMemberRepository.findById(new RoomMemberId(roomId, targetUserId))
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));
                
        target.setLeftAt(LocalDateTime.now());
        roomMemberRepository.save(target);
        
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId + "/members/" + targetUserId, 
            Map.of("action", "KICKED"));
    }

    @Override
    public void banMember(Long roomId, Long targetUserId, Long hostUserId) {
        Room room = roomRepository.findById(roomId).orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        if (!room.getHost().getId().equals(hostUserId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        
        RoomMember target = roomMemberRepository.findById(new RoomMemberId(roomId, targetUserId))
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));
                
        target.setLeftAt(LocalDateTime.now());
        target.setBanned(true);
        roomMemberRepository.save(target);
        
        messagingTemplate.convertAndSend("/topic/rooms/" + roomId + "/members/" + targetUserId, 
            Map.of("action", "BANNED"));
    }

    @Override
    public void approveMember(Long roomId, Long targetUserId, Long hostUserId) {
        Room room = roomRepository.findById(roomId).orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        if (!room.getHost().getId().equals(hostUserId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        
        RoomMember target = roomMemberRepository.findById(new RoomMemberId(roomId, targetUserId))
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));
                
        if (target.getRole() == RoomRole.PENDING) {
            target.setRole(RoomRole.MEMBER);
            roomMemberRepository.save(target);
            
            messagingTemplate.convertAndSend("/topic/rooms/" + roomId + "/members/" + targetUserId, 
                Map.of("action", "APPROVED"));
        }
    }

    @Override
    public void rejectMember(Long roomId, Long targetUserId, Long hostUserId) {
        Room room = roomRepository.findById(roomId).orElseThrow(() -> new AppException(ErrorCode.ROOM_NOT_FOUND));
        if (!room.getHost().getId().equals(hostUserId)) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        
        RoomMember target = roomMemberRepository.findById(new RoomMemberId(roomId, targetUserId))
                .orElseThrow(() -> new AppException(ErrorCode.ROOM_MEMBER_NOT_FOUND));
                
        if (target.getRole() == RoomRole.PENDING) {
            target.setLeftAt(LocalDateTime.now());
            roomMemberRepository.save(target);
            
            messagingTemplate.convertAndSend("/topic/rooms/" + roomId + "/members/" + targetUserId, 
                Map.of("action", "REJECTED"));
        }
    }
}
