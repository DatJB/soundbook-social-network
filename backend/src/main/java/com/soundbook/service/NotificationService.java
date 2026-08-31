package com.soundbook.service;

import com.soundbook.dto.notification.NotificationCursorPageResponse;
import com.soundbook.dto.notification.NotificationResponse;
import com.soundbook.entity.enums.NotificationType;
import com.soundbook.entity.enums.TargetType;

public interface NotificationService
{
    NotificationCursorPageResponse getNotifications(Long userId, String cursor, int limit);

    NotificationResponse markAsRead(Long notificationId, Boolean isRead);

    void deleteNotification(Long notificationId);

    long getUnreadCount(Long userId);

    void markAllAsRead(Long userId);

    /**
     * Save a notification to DB and push it to the recipient via WebSocket.
     */
    void send(Long recipientId, Long actorId,
              NotificationType type, TargetType targetType,
              Long targetId, String content);
}
