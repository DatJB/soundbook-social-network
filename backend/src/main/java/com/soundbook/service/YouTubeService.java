package com.soundbook.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.dto.youtube.YouTubeVideoResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
@RequiredArgsConstructor
public class YouTubeService {

    @Value("${youtube.api-key:}")
    private String apiKey;

    private static final String YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
    private final RestTemplate restTemplate;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

//    public List<YouTubeVideoResponse> searchVideos(String query, int maxResults) {
//        if (apiKey == null || apiKey.isEmpty()) {
//            log.warn("YouTube API Key is not configured!");
//            return new ArrayList<>();
//        }
//
//        String url = UriComponentsBuilder.fromHttpUrl(YOUTUBE_API_BASE + "/search")
//                .queryParam("part", "snippet")
//                .queryParam("q", query)
//                .queryParam("type", "video")
//                .queryParam("maxResults", maxResults)
//                .queryParam("key", apiKey)
//                .toUriString();
//
//        try {
//            JsonNode response = restTemplate.getForObject(url, JsonNode.class);
//            List<YouTubeVideoResponse> videos = new ArrayList<>();
//
//            if (response != null && response.has("items")) {
//                for (JsonNode item : response.get("items")) {
//                    JsonNode snippet = item.get("snippet");
//                    videos.add(YouTubeVideoResponse.builder()
//                            .videoId(item.get("id").get("videoId").asText())
//                            .title(snippet.get("title").asText())
//                            .description(snippet.get("description").asText())
//                            .thumbnail(snippet.get("thumbnails").get("default").get("url").asText())
//                            .channelTitle(snippet.get("channelTitle").asText())
//                            .publishedAt(snippet.get("publishedAt").asText())
//                            .build());
//                }
//            }
//            return videos;
//        } catch (Exception e) {
//            log.error("Error calling YouTube API search", e);
//            return new ArrayList<>();
//        }
//    }

    public List<YouTubeVideoResponse> searchVideos(String query, int maxResults)
    {
        if (apiKey == null || apiKey.isEmpty())
        {
            log.warn("YouTube API Key is not configured!");
            return new ArrayList<>();
        }

        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();

        String cacheKey =
                "youtube:search:" + normalizedQuery + ":" + maxResults;

        // Redis hit
        String cached = redisTemplate.opsForValue().get(cacheKey);

        if (cached != null)
        {
            try {
                log.info("YouTube Redis HIT: {}", cacheKey);

                return objectMapper.readValue(
                        cached,
                        new TypeReference<List<YouTubeVideoResponse>>() {}
                );

            } catch (JsonProcessingException e) {
                log.warn("Invalid YouTube cache, deleting: {}", cacheKey);
                redisTemplate.delete(cacheKey);
            }
        }

        // Redis miss, call youtube api
        log.info("YouTube Redis MISS: {}", cacheKey);

        String url = UriComponentsBuilder
                .fromHttpUrl(YOUTUBE_API_BASE + "/search")
                .queryParam("part", "snippet")
                .queryParam("q", query)
                .queryParam("type", "video")
                .queryParam("maxResults", maxResults)
                .queryParam("key", apiKey)
                .toUriString();

        try {

            JsonNode response =
                    restTemplate.getForObject(url, JsonNode.class);

            List<YouTubeVideoResponse> videos = new ArrayList<>();

            if (response != null && response.has("items")) {

                for (JsonNode item : response.get("items")) {

                    JsonNode snippet = item.get("snippet");

                    videos.add(
                            YouTubeVideoResponse.builder()
                                    .videoId(item.get("id").get("videoId").asText())
                                    .title(snippet.get("title").asText())
                                    .description(snippet.get("description").asText())
                                    .thumbnail(
                                            snippet.get("thumbnails")
                                                    .get("default")
                                                    .get("url")
                                                    .asText()
                                    )
                                    .channelTitle(snippet.get("channelTitle").asText())
                                    .publishedAt(snippet.get("publishedAt").asText())
                                    .build()
                    );
                }
            }

            // Save to redis - 1 hour
            try {

                String json =
                        objectMapper.writeValueAsString(videos);

                redisTemplate.opsForValue().set(
                        cacheKey,
                        json,
                        1,
                        TimeUnit.HOURS
                );

            } catch (JsonProcessingException e) {

                log.warn(
                        "Cannot serialize YouTube search result for cache",
                        e
                );
            }

            return videos;

        } catch (Exception e) {

            log.error("Error calling YouTube API search", e);

            return new ArrayList<>();
        }
    }

//    public YouTubeVideoResponse getVideoDetails(String videoId) {
//        if (apiKey == null || apiKey.isEmpty()) {
//            return null;
//        }
//
//        String url = UriComponentsBuilder.fromHttpUrl(YOUTUBE_API_BASE + "/videos")
//                .queryParam("part", "contentDetails,snippet")
//                .queryParam("id", videoId)
//                .queryParam("key", apiKey)
//                .toUriString();
//
//        try {
//            JsonNode response = restTemplate.getForObject(url, JsonNode.class);
//            if (response != null && response.has("items") && response.get("items").size() > 0) {
//                JsonNode item = response.get("items").get(0);
//                JsonNode snippet = item.get("snippet");
//                String durationIso = item.get("contentDetails").get("duration").asText();
//
//                return YouTubeVideoResponse.builder()
//                        .videoId(item.get("id").asText())
//                        .title(snippet.get("title").asText())
//                        .description(snippet.get("description").asText())
//                        .thumbnail(snippet.get("thumbnails").get("default").get("url").asText())
//                        .channelTitle(snippet.get("channelTitle").asText())
//                        .durationSeconds(parseIsoDuration(durationIso))
//                        .build();
//            }
//            return null;
//        } catch (Exception e) {
//            log.error("Error calling YouTube API video details", e);
//            return null;
//        }
//    }

    public YouTubeVideoResponse getVideoDetails(String videoId)
    {
        if (apiKey == null || apiKey.isEmpty())
        {
            return null;
        }

        String cacheKey =
                "youtube:video:" + videoId;

        // Redis hit
        String cached = redisTemplate.opsForValue().get(cacheKey);

        if (cached != null) {

            try {

                log.info("YouTube Redis HIT: {}", cacheKey);

                return objectMapper.readValue(
                        cached,
                        YouTubeVideoResponse.class
                );

            } catch (JsonProcessingException e) {

                log.warn(
                        "Invalid YouTube video cache, deleting: {}",
                        cacheKey
                );

                redisTemplate.delete(cacheKey);
            }
        }

        // Redis miss
        log.info("YouTube Redis MISS: {}", cacheKey);

        String url = UriComponentsBuilder
                .fromHttpUrl(YOUTUBE_API_BASE + "/videos")
                .queryParam("part", "contentDetails,snippet")
                .queryParam("id", videoId)
                .queryParam("key", apiKey)
                .toUriString();

        try {

            JsonNode response =
                    restTemplate.getForObject(url, JsonNode.class);

            if (response != null
                    && response.has("items")
                    && response.get("items").size() > 0) {

                JsonNode item =
                        response.get("items").get(0);

                JsonNode snippet =
                        item.get("snippet");

                String durationIso =
                        item.get("contentDetails")
                                .get("duration")
                                .asText();

                YouTubeVideoResponse result =
                        YouTubeVideoResponse.builder()
                                .videoId(item.get("id").asText())
                                .title(snippet.get("title").asText())
                                .description(snippet.get("description").asText())
                                .thumbnail(
                                        snippet.get("thumbnails")
                                                .get("default")
                                                .get("url")
                                                .asText()
                                )
                                .channelTitle(
                                        snippet.get("channelTitle").asText()
                                )
                                .durationSeconds(
                                        parseIsoDuration(durationIso)
                                )
                                .build();

                // Save to redis - 24 hours
                try {

                    String json =
                            objectMapper.writeValueAsString(result);

                    redisTemplate.opsForValue().set(
                            cacheKey,
                            json,
                            24,
                            TimeUnit.HOURS
                    );

                } catch (JsonProcessingException e) {

                    log.warn(
                            "Cannot serialize YouTube video cache",
                            e
                    );
                }

                return result;
            }

            return null;

        } catch (Exception e) {

            log.error(
                    "Error calling YouTube API video details",
                    e
            );

            return null;
        }
    }

    private int parseIsoDuration(String duration) {
        if (duration == null || duration.isEmpty())
            return 0;

        Pattern pattern = Pattern.compile("PT(\\d+H)?(\\d+M)?(\\d+S)?");
        Matcher matcher = pattern.matcher(duration);

        if (!matcher.matches())
            return 0;

        int hours = 0;
        int minutes = 0;
        int seconds = 0;

        if (matcher.group(1) != null)
            hours = Integer.parseInt(matcher.group(1).replace("H", ""));
        if (matcher.group(2) != null)
            minutes = Integer.parseInt(matcher.group(2).replace("M", ""));
        if (matcher.group(3) != null)
            seconds = Integer.parseInt(matcher.group(3).replace("S", ""));

        return hours * 3600 + minutes * 60 + seconds;
    }
}
