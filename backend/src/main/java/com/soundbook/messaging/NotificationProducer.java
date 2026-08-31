package com.soundbook.messaging;

import com.soundbook.config.RabbitMQConfig;
import com.soundbook.event.NotificationEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class NotificationProducer
{
    private final RabbitTemplate rabbitTemplate;

    public void publish(NotificationEvent event)
    {
        rabbitTemplate.convertAndSend(
                RabbitMQConfig.EXCHANGE_NAME,
                RabbitMQConfig.NOTIFICATION_ROUTING_KEY,
                event
        );
    }
}