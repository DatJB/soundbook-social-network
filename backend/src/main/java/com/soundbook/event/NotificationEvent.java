package com.soundbook.event;

import com.soundbook.entity.enums.NotificationType;
import com.soundbook.entity.enums.TargetType;

public record NotificationEvent(
        Long recipientId,
        Long actorId,
        NotificationType type,
        TargetType targetType,
        Long targetId,
        String content
) {
}