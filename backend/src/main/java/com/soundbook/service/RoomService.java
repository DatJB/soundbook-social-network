package com.soundbook.service;

import com.soundbook.dto.room.*;

import java.util.List;

public interface RoomService {
    RoomDetailResponse createRoom(CreateRoomRequest request);

    List<ActiveRoomResponse> getActiveRooms(int limit);

    RoomDetailResponse joinRoom(Long roomId, Long userId);

    RoomDetailResponse leaveRoom(Long roomId, Long userId);

    RoomDetailResponse getRoomDetail(Long roomId);

    RoomPlaybackStateResponse getRoomState(Long roomId);

    // Chat
    RoomMessageResponse sendRoomMessage(Long roomId, RoomMessageSendRequest request);

    // Playback
    RoomPlaybackStateResponse updatePlaybackState(Long roomId, RoomPlaybackUpdateRequest request);

    // Queue
    RoomQueueItemResponse addToQueue(Long roomId, RoomQueueAddRequest request);

    List<RoomQueueItemResponse> getRoomQueue(Long roomId);

    RoomQueueItemResponse voteQueueItem(Long queueItemId);

    void removeQueueItem(Long roomId, Long queueItemId);

    void kickMember(Long roomId, Long targetUserId, Long hostUserId);
    void banMember(Long roomId, Long targetUserId, Long hostUserId);
    void approveMember(Long roomId, Long targetUserId, Long hostUserId);
    void rejectMember(Long roomId, Long targetUserId, Long hostUserId);
}
