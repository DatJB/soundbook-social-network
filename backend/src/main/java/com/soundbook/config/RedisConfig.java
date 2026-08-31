package com.soundbook.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(
            RedisConnectionFactory connectionFactory) {

        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        ObjectMapper objectMapper = new ObjectMapper();

        // Hỗ trợ LocalDateTime
        objectMapper.registerModule(new JavaTimeModule());

        // Cho phép deserialize các class của project + collection
        BasicPolymorphicTypeValidator validator =
                BasicPolymorphicTypeValidator.builder()
                        .allowIfSubType("com.soundbook")
                        .allowIfSubType("java.util")
                        .build();

        objectMapper.activateDefaultTyping(
                validator,
                ObjectMapper.DefaultTyping.NON_FINAL
        );

        StringRedisSerializer keySerializer =
                new StringRedisSerializer();

        GenericJackson2JsonRedisSerializer valueSerializer =
                new GenericJackson2JsonRedisSerializer(objectMapper);

        template.setKeySerializer(keySerializer);
        template.setHashKeySerializer(keySerializer);
        template.setValueSerializer(valueSerializer);
        template.setHashValueSerializer(valueSerializer);

        template.afterPropertiesSet();

        return template;
    }
}