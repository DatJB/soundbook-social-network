package com.soundbook.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.ai.Content;
import com.soundbook.dto.ai.GeminiRequest;
import com.soundbook.dto.ai.GenerationConfig;
import com.soundbook.dto.ai.Part;
import com.soundbook.entity.Post;
import com.soundbook.repository.PostRepository;
import com.soundbook.service.AiService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiServiceImpl implements AiService
{
    @Value("${gemini.api-key}")
    private String apiKey;

    private final PostRepository postRepository;
    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    @Override
    public String getPostInsight(Long postId)
    {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new AppException(ErrorCode.POST_NOT_FOUND));

        String prompt = buildSuperPrompt(post);

        return callGemini(prompt, 0.9);
    }

    @Override
    public String chatWithPost(Long postId, String userMessage)
    {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new AppException(ErrorCode.POST_NOT_FOUND));

        String prompt = String.format(
                "Dựa trên nội dung bài viết: '%s'. Hãy trả lời câu hỏi của người dùng như một chatbot thân thiện: '%s'",
                post.getCaption(), userMessage
        );

        return callGemini(prompt, 0.7);
    }

    public String callGemini(String prompt, Double temperature)
    {
        Part part = new Part(prompt);

        Content content = new Content(List.of(part));

        GenerationConfig config = GenerationConfig.builder()
                .temperature(temperature)
                .maxOutputTokens(4096)
                .build();

        GeminiRequest request = GeminiRequest.builder()
                .contents(List.of(content))
                .generationConfig(config)
                .build();

        try
        {
            String responseJson = webClient.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/gemini-2.5-flash-lite:generateContent")
                            .queryParam("key", apiKey)
                            .build())
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(String.class)
                    .retryWhen(Retry.backoff(3, Duration.ofSeconds(2)))
                    .block();

            JsonNode root = objectMapper.readTree(responseJson);
            return root.path("candidates")
                    .get(0)
                    .path("content")
                    .path("parts")
                    .get(0)
                    .path("text")
                    .asText();

        } catch (Exception e)
        {
            Throwable rootCause = e;
            while (rootCause.getCause() != null && !(rootCause instanceof org.springframework.web.reactive.function.client.WebClientResponseException))
            {
                rootCause = rootCause.getCause();
            }

            if (rootCause instanceof org.springframework.web.reactive.function.client.WebClientResponseException)
            {
                var webClientEx = (org.springframework.web.reactive.function.client.WebClientResponseException) rootCause;

                log.error("GOOGLE API BÁO LỖI: Mã = {}, Chi tiết = {}",
                        webClientEx.getStatusCode(),
                        webClientEx.getResponseBodyAsString());

                return "AI Soundbook đang bảo trì hệ thống. Thử lại sau nhé!";
            }

            log.error("LỖI HỆ THỐNG KHÔNG XÁC ĐỊNH: ", e);
            return "AI Soundbook đang bảo trì hệ thống. Thử lại sau nhé!";
        }
    }

    private String buildSuperPrompt(Post post)
    {
        String refContext = (post.getRefJson() != null && !post.getRefJson().isBlank())
                ? "Thông tin đính kèm (Sách/Nhạc): " + post.getRefJson()
                : "Bài viết này không có đính kèm.";

        return String.format(
                "Bạn là trợ lý AI của Soundbook (Mạng xã hội tích hợp âm nhạc và sách). Bài viết thuộc loại: %s. " +
                        "Nội dung: %s. Thông tin đính kèm (Sách/Nhạc): %s. " +
                        "Hãy: 1. Tóm tắt sáng tạo (đổi phong cách mỗi lần). " +
                        "2. Gợi ý 2 link liên quan (Tiki/Spotify/Youtube/Wiki). " +
                        "3. Chào mời người dùng chat về nội dung này." +
                        "Ghi ra các mục cho tinh tế 1 chút. Bạn là Soundbook AI mà.",
                post.getType(), post.getCaption(), refContext
        );
    }
}
