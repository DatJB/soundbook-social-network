package com.soundbook.service.impl;

import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.notification.NotificationCursorPageResponse;
import com.soundbook.dto.notification.NotificationResponse;
import com.soundbook.entity.Notification;
import com.soundbook.entity.User;
import com.soundbook.entity.UserProfile;
import com.soundbook.entity.enums.NotificationType;
import com.soundbook.entity.enums.TargetType;
import com.soundbook.repository.NotificationRepository;
import com.soundbook.repository.UserProfileRepository;
import com.soundbook.repository.UserRepository;
import com.soundbook.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
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
public class NotificationServiceImpl implements NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Override
    @Transactional(readOnly = true)
    public NotificationCursorPageResponse getNotifications(Long userId, String cursor, int limit) {
        // Verify user exists
        userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        // Sanitize limit (1-100 range)
        int sanitizedLimit = Math.max(1, Math.min(limit, 100));

        // Parse cursor
        LocalDateTime cursorCreatedAt = null;
        Long cursorId = null;

        if (cursor != null && !cursor.isEmpty()) {
            try {
                String[] parts = cursor.split("\\|");
                if (parts.length != 2) {
                    throw new AppException(ErrorCode.INVALID_CURSOR);
                }
                cursorCreatedAt = LocalDateTime.parse(parts[0]);
                cursorId = Long.parseLong(parts[1]);
            } catch (Exception e) {
                throw new AppException(ErrorCode.INVALID_CURSOR);
            }
        }

        // Query with limit + 1 to determine if there are more results
        Pageable pageable = PageRequest.of(0, sanitizedLimit + 1);
        List<Notification> results = notificationRepository.findNotificationsWithCursor(
                userId,
            cursorCreatedAt,
                cursorId,
                pageable
        );

        // Check if there are more results
        String nextCursor = null;
        List<Notification> notifications = results;
        if (results.size() > sanitizedLimit) {
            notifications = results.subList(0, sanitizedLimit);
            Notification lastNotif = notifications.get(notifications.size() - 1);
            nextCursor = formatCursor(lastNotif.getCreatedAt(), lastNotif.getId());
        }

        // Convert to response DTOs
        List<NotificationResponse> responses = toNotificationResponses(notifications);
        return NotificationCursorPageResponse.builder()
                .items(responses)
                .nextCursor(nextCursor)
                .build();
    }

    @Override
    public NotificationResponse markAsRead(Long notificationId, Boolean isRead) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new AppException(ErrorCode.NOTIFICATION_NOT_FOUND));

        notification.setIsRead(isRead);
        Notification saved = notificationRepository.save(notification);
        NotificationResponse response = toNotificationResponse(saved);
        publishNotificationEvent(saved.getUser().getId(), "notification.updated", response);
        publishUnreadCount(saved.getUser().getId());
        return response;
    }

    @Override
    public void deleteNotification(Long notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new AppException(ErrorCode.NOTIFICATION_NOT_FOUND));
        Long userId = notification.getUser().getId();
        notificationRepository.delete(notification);
        publishNotificationEvent(userId, "notification.deleted", Map.of("notificationId", notificationId));
        publishUnreadCount(userId);
    }

    @Override
    @Transactional(readOnly = true)
    public long getUnreadCount(Long userId) {
        return notificationRepository.countByUser_IdAndIsReadFalse(userId);
    }

    @Override
    public void markAllAsRead(Long userId) {
        // Verify user exists
        userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        // Get all unread notifications for this user
        Pageable pageable = PageRequest.of(0, 10000);  // Large limit to get all unread
        List<Notification> unreadNotifications = notificationRepository.findNotificationsWithCursor(
                userId,
                null,
                null,
                pageable
        );

        // Mark all as read
        for (Notification notif : unreadNotifications) {
            if (!notif.getIsRead()) {
                notif.setIsRead(true);
            }
        }
        notificationRepository.saveAll(unreadNotifications);
        publishNotificationEvent(userId, "notification.all-read", Map.of("userId", userId));
        publishUnreadCount(userId);
    }

    private void publishNotificationEvent(Long userId, String eventType, Object payload) {
        Map<String, Object> event = Map.of(
                "eventType", eventType,
                "payload", payload
        );
        messagingTemplate.convertAndSend("/topic/users/" + userId + "/notifications", event);
    }

    private void publishUnreadCount(Long userId) {
        long unreadCount = notificationRepository.countByUser_IdAndIsReadFalse(userId);
        messagingTemplate.convertAndSend("/topic/users/" + userId + "/notifications/unread-count", Map.of(
                "eventType", "notification.unread-count",
                "payload", Map.of("unreadCount", unreadCount)
        ));
    }

    @Override
    public void send(Long recipientId, Long actorId,
                     NotificationType type, TargetType targetType,
                     Long targetId, String content) {

        User recipient = userRepository.findById(recipientId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        User actor = actorId != null
                ? userRepository.findById(actorId).orElse(null)
                : null;

        Notification saved = notificationRepository.save(
                Notification.builder()
                        .user(recipient)
                        .actor(actor)
                        .type(type)
                        .targetType(targetType)
                        .targetId(targetId)
                        .content(content)
                        .isRead(false)
                        .build()
        );

        NotificationResponse response = toNotificationResponse(saved);
        publishNotificationEvent(recipientId, "notification.new", response);
        publishUnreadCount(recipientId);
    }

    // ==================== HELPER METHODS ====================

    private NotificationResponse toNotificationResponse(Notification notification) {
        UserProfile actorProfile = null;
        if (notification.getActor() != null) {
            actorProfile = userProfileRepository.findById(notification.getActor().getId()).orElse(null);
        }

        return NotificationResponse.builder()
                .id(notification.getId())
                .type(notification.getType().name())
                .targetType(notification.getTargetType() != null ? notification.getTargetType().name() : null)
                .targetId(notification.getTargetId())
                .content(notification.getContent())
                .actorUserId(notification.getActor() != null ? notification.getActor().getId() : null)
                .actorDisplayName(notification.getActor() != null ? notification.getActor().getDisplayName() : null)
                .actorAvatarUrl(actorProfile != null ? actorProfile.getAvatarUrl() : null)
                .isRead(notification.getIsRead())
                .createdAt(notification.getCreatedAt())
                .build();
    }

    private List<NotificationResponse> toNotificationResponses(List<Notification> notifications) {
        // Batch load actor profiles
        List<Long> actorIds = notifications.stream()
                .filter(n -> n.getActor() != null)
                .map(n -> n.getActor().getId())
                .distinct()
                .toList();

        Map<Long, UserProfile> profileByUserId = userProfileRepository.findAllById(actorIds)
                .stream()
                .collect(Collectors.toMap(UserProfile::getUserId, Function.identity()));

        return notifications.stream()
                .map(notif -> {
                    UserProfile actorProfile = null;
                    if (notif.getActor() != null) {
                        actorProfile = profileByUserId.get(notif.getActor().getId());
                    }
                    return NotificationResponse.builder()
                            .id(notif.getId())
                            .type(notif.getType().name())
                            .targetType(notif.getTargetType() != null ? notif.getTargetType().name() : null)
                            .targetId(notif.getTargetId())
                            .content(notif.getContent())
                            .actorUserId(notif.getActor() != null ? notif.getActor().getId() : null)
                            .actorDisplayName(notif.getActor() != null ? notif.getActor().getDisplayName() : null)
                            .actorAvatarUrl(actorProfile != null ? actorProfile.getAvatarUrl() : null)
                            .isRead(notif.getIsRead())
                            .createdAt(notif.getCreatedAt())
                            .build();
                })
                .toList();
    }

    private String formatCursor(LocalDateTime createdAt, Long id) {
        return createdAt + "|" + id;
    }
}
