package com.soundbook.messaging;

import com.soundbook.config.RabbitMQConfig;
import com.soundbook.event.PostChangedEvent;
import com.soundbook.event.PostChangedEvent;
import com.soundbook.event.TasteUpdatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RabbitMQProducer
{
    private final RabbitTemplate rabbitTemplate;

    public void publishPostChanged(Long authorId, Long postId, PostChangedEvent.Action action)
    {
        PostChangedEvent event =
                new PostChangedEvent(
                        authorId,
                        postId,
                        action
                );

        rabbitTemplate.convertAndSend(
                RabbitMQConfig.EXCHANGE_NAME,
                RabbitMQConfig.FEED_ROUTING_KEY,
                event
        );
    }

    public void publishTasteUpdated(Long userId)
    {
        TasteUpdatedEvent event = new TasteUpdatedEvent(userId);

        rabbitTemplate.convertAndSend(
                RabbitMQConfig.EXCHANGE_NAME,
                RabbitMQConfig.TASTE_ROUTING_KEY,
                event
        );
    }
}