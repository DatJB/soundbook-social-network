package com.soundbook.messaging;

import com.soundbook.config.RabbitMQConfig;
import com.soundbook.event.TasteUpdatedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
@RequiredArgsConstructor
@Slf4j
public class TasteInvalidationConsumer
{
    private final RedisTemplate<String, String> redisTemplate;

    @RabbitListener(queues = RabbitMQConfig.TASTE_QUEUE)
    public void handleTasteUpdated(TasteUpdatedEvent event)
    {
        Long userId = event.userId();

        log.info(
                "Received TasteUpdatedEvent: userId={}",
                userId
        );

        // Cache recommended matches của chính user
        redisTemplate.delete(
                "taste:matches:" + userId
        );

        // Cache match:userId:otherUserId
        Set<String> outgoingKeys =
                redisTemplate.keys(
                        "taste:match:" + userId + ":*"
                );

        if (outgoingKeys != null && !outgoingKeys.isEmpty())
        {
            redisTemplate.delete(outgoingKeys);
        }

        // Cache match:otherUserId:userId
        Set<String> incomingKeys =
                redisTemplate.keys(
                        "taste:match:*:" + userId
                );

        if (incomingKeys != null && !incomingKeys.isEmpty())
        {
            redisTemplate.delete(incomingKeys);
        }

        log.info(
                "Taste cache invalidated for userId={}",
                userId
        );
    }
}