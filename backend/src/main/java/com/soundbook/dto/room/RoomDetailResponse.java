package com.soundbook.dto.room;

import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Builder
public class RoomDetailResponse {
    private Long roomId;
    private String name;
    private String topic;
    private Boolean isPublic;
    private String status;
    private Long hostUserId;
    private String hostDisplayName;
    private LocalDateTime createdAt;
    private LocalDateTime endedAt;
    private Long listenersCount;
    private RoomPlaybackStateResponse state;
    private List<RoomMemberResponse> members;
    private List<RoomMemberResponse> pendingMembers;
}
