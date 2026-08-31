package com.soundbook.messaging;

import com.soundbook.config.RabbitMQConfig;
import com.soundbook.event.PostChangedEvent;
import com.soundbook.repository.FollowRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class FeedInvalidationConsumer
{
    private final FollowRepository followRepository;
    private final RedisTemplate<String, String> redisTemplate;

    @RabbitListener(queues = RabbitMQConfig.FEED_QUEUE)
    public void handlePostChanged(PostChangedEvent event)
    {
        Long authorId = event.authorId();

        log.info(
                "Received PostChangedEvent: action={}, authorId={}, postId={}",
                event.action(),
                authorId,
                event.postId()
        );

        // Invalidate Feed của chính author
        invalidateFeed(authorId);

        // Invalidate Feed của tất cả follower
        followRepository.findByIdFolloweeId(authorId)
                .forEach(follow -> {

                    Long followerId = follow.getId().getFollowerId();

                    invalidateFeed(followerId);
                });
    }

    private void invalidateFeed(Long userId)
    {
        redisTemplate.delete("feed:" + userId + ":discover");
        redisTemplate.delete("feed:" + userId + ":following");

        log.info(
                "Feed cache invalidated for userId={}",
                userId
        );
    }
}