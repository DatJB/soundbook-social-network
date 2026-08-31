package com.soundbook.messaging;

import com.soundbook.config.RabbitMQConfig;
import com.soundbook.dto.notification.NotificationResponse;
import com.soundbook.entity.Notification;
import com.soundbook.entity.User;
import com.soundbook.event.NotificationEvent;
import com.soundbook.repository.NotificationRepository;
import com.soundbook.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationConsumer
{
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @RabbitListener(queues = RabbitMQConfig.NOTIFICATION_QUEUE)
    public void handle(NotificationEvent event)
    {
        log.info(
                "Received NotificationEvent: type={}, recipientId={}, actorId={}",
                event.type(),
                event.recipientId(),
                event.actorId()
        );

        User recipient = userRepository.findById(event.recipientId())
                .orElseThrow(() ->
                        new RuntimeException("Recipient not found")
                );

        User actor = null;

        if (event.actorId() != null) {
            actor = userRepository.findById(event.actorId())
                    .orElse(null);
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

        Notification saved =
                notificationRepository.save(notification);

        // Build response DTO
        NotificationResponse response =
                new NotificationResponse();

        response.setId(saved.getId());
        response.setType(saved.getType().name());

        response.setTargetType(
                saved.getTargetType() != null
                        ? saved.getTargetType().name()
                        : null
        );

        response.setTargetId(saved.getTargetId());
        response.setContent(saved.getContent());

        if (actor != null) {
            response.setActorUserId(actor.getId());
            response.setActorDisplayName(actor.getDisplayName());

            if (actor.getProfile() != null) {
                response.setActorAvatarUrl(
                        actor.getProfile().getAvatarUrl()
                );
            }
        }

        response.setIsRead(saved.getIsRead());
        response.setCreatedAt(saved.getCreatedAt());

        // Push realtime
        messagingTemplate.convertAndSend(
                "/topic/notifications/" + recipient.getId(),
                response
        );

        log.info(
                "Notification saved and pushed to userId={}",
                recipient.getId()
        );
    }
}