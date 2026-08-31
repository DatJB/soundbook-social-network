package com.soundbook.messaging;

import com.soundbook.config.RabbitMQConfig;
import com.soundbook.dto.notification.NotificationResponse;
import com.soundbook.entity.Notification;
import com.soundbook.entity.User;
import com.soundbook.entity.UserProfile;
import com.soundbook.event.NotificationEvent;
import com.soundbook.repository.NotificationRepository;
import com.soundbook.repository.UserProfileRepository;
import com.soundbook.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationConsumer
{
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @RabbitListener(queues = RabbitMQConfig.NOTIFICATION_QUEUE)
    @Transactional
    public void handle(NotificationEvent event)
    {
        log.info(
                "Received NotificationEvent: type={}, recipientId={}, actorId={}",
                event.type(),
                event.recipientId(),
                event.actorId()
        );

        User recipient = userRepository.findById(event.recipientId())
                .orElse(null);

        if (recipient == null) {
            log.warn("Recipient not found for id: {}", event.recipientId());
            return;
        }

        User actor = null;
        UserProfile actorProfile = null;

        if (event.actorId() != null) {
            actor = userRepository.findById(event.actorId()).orElse(null);
            actorProfile = userProfileRepository.findById(event.actorId()).orElse(null);
        }

        Notification notification = Notification.builder()
                .user(recipient)
                .actor(actor)
                .type(event.type())
                .targetType(event.targetType())
                .targetId(event.targetId())
                .content(event.content())
                .isRead(false)
                .build();

        Notification saved = notificationRepository.save(notification);

        // Build response DTO
        NotificationResponse response = NotificationResponse.builder()
                .id(saved.getId())
                .type(saved.getType().name())
                .targetType(saved.getTargetType() != null ? saved.getTargetType().name() : null)
                .targetId(saved.getTargetId())
                .content(saved.getContent())
                .actorUserId(actor != null ? actor.getId() : null)
                .actorDisplayName(actor != null ? actor.getDisplayName() : null)
                .actorAvatarUrl(actorProfile != null ? actorProfile.getAvatarUrl() : (actor != null && actor.getProfile() != null ? actor.getProfile().getAvatarUrl() : null))
                .isRead(saved.getIsRead())
                .createdAt(saved.getCreatedAt())
                .build();

        // Push realtime notification
        messagingTemplate.convertAndSend(
                "/topic/notifications/" + recipient.getId(),
                response
        );

        // Push unread count
        long unreadCount = notificationRepository.countByUser_IdAndIsReadFalse(recipient.getId());
        messagingTemplate.convertAndSend(
                "/topic/users/" + recipient.getId() + "/notifications/unread-count",
                Map.of("eventType", "notification.unread-count", "payload", Map.of("unreadCount", unreadCount))
        );

        log.info(
                "Notification saved and pushed via RabbitMQ to userId={}",
                recipient.getId()
        );
    }
}