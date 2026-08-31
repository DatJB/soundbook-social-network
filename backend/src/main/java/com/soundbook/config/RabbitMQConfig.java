package com.soundbook.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig
{
    // Main exchange
    public static final String EXCHANGE_NAME = "soundbook.events";

    // Feed
    public static final String FEED_QUEUE = "soundbook.feed.invalidate";
    public static final String FEED_ROUTING_KEY = "feed.invalidate";

    // Taste DNA
    public static final String TASTE_QUEUE = "soundbook.taste.invalidate";
    public static final String TASTE_ROUTING_KEY = "taste.invalidate";

    @Bean
    public DirectExchange soundbookExchange()
    {
        return new DirectExchange(EXCHANGE_NAME);
    }

    @Bean
    public Queue feedInvalidateQueue()
    {
        return QueueBuilder
                .durable(FEED_QUEUE)
                .build();
    }

    @Bean
    public Binding feedInvalidateBinding(Queue feedInvalidateQueue, DirectExchange soundbookExchange)
    {
        return BindingBuilder
                .bind(feedInvalidateQueue)
                .to(soundbookExchange)
                .with(FEED_ROUTING_KEY);
    }

    @Bean
    public Queue tasteInvalidateQueue()
    {
        return QueueBuilder
                .durable(TASTE_QUEUE)
                .build();
    }

    @Bean
    public Binding tasteInvalidateBinding(
            Queue tasteInvalidateQueue,
            DirectExchange soundbookExchange)
    {
        return BindingBuilder
                .bind(tasteInvalidateQueue)
                .to(soundbookExchange)
                .with(TASTE_ROUTING_KEY);
    }

    // Serialize Java object to JSON
    @Bean
    public Jackson2JsonMessageConverter jackson2JsonMessageConverter()
    {
        return new Jackson2JsonMessageConverter();
    }

    // Cho RabbitTemplate sử dụng JSON converter
    @Bean
    public RabbitTemplate rabbitTemplate(
            ConnectionFactory connectionFactory,
            Jackson2JsonMessageConverter messageConverter)
    {
        RabbitTemplate rabbitTemplate =
                new RabbitTemplate(connectionFactory);

        rabbitTemplate.setMessageConverter(messageConverter);

        return rabbitTemplate;
    }
}