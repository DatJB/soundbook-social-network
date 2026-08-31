package com.soundbook.controller;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/test/redis")
public class RedisTestController
{
    private final RedisTemplate<String, Object> redisTemplate;

    public RedisTestController(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @GetMapping("/set")
    public String set() {
        redisTemplate.opsForValue().set("soundbook:test", "Redis is working!");
        return "OK";
    }

    @GetMapping("/get")
    public String get() {
        Object value = redisTemplate.opsForValue().get("soundbook:test");
        return value != null ? value.toString() : "NOT FOUND";
    }
}
