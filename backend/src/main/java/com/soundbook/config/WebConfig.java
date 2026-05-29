package com.soundbook.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
            .allowedOriginPatterns(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://soundbook-social-network.vercel.app",
                "https://*.vercel.app",
                "https://*.trycloudflare.com",
                "https://*.trycloudflare.net",
                "https://*.ngrok-free.dev",
                "https://*.ngrok.io"
            )
            .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true);
    }

    @org.springframework.context.annotation.Bean
    public org.springframework.web.client.RestTemplate restTemplate() {
        return new org.springframework.web.client.RestTemplate();
    }
}
