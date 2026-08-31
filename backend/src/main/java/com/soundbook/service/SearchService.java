package com.soundbook.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.search.SearchResponse;
import com.soundbook.dto.search.SearchShelfItemResponse;
import com.soundbook.dto.social.FriendUserResponse;
import com.soundbook.entity.User;
import com.soundbook.entity.UserBookshelfItem;
import com.soundbook.entity.UserMusicCollection;
import com.soundbook.entity.enums.Visibility;
import com.soundbook.repository.UserBookshelfItemRepository;
import com.soundbook.repository.UserMusicCollectionRepository;
import com.soundbook.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class SearchService {

    private final UserRepository userRepository;
    private final UserMusicCollectionRepository musicCollectionRepository;
    private final UserBookshelfItemRepository bookshelfItemRepository;
    private final FriendService friendService;
    private final FeedService feedService;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

//    @Transactional(readOnly = true)
//    public SearchResponse search(String email, String query, Integer limit) {
//        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
//        String normalizedQuery = query == null ? "" : query.trim();
//        int normalizedLimit = Math.max(1, Math.min(limit == null ? 5 : limit, 20));
//        if (normalizedQuery.isBlank()) {
//            return SearchResponse.builder()
//                    .query("")
//                    .users(List.of())
//                    .posts(List.of())
//                    .music(List.of())
//                    .books(List.of())
//                    .build();
//        }
//
//        List<FriendUserResponse> users = userRepository.searchUsers(currentUser.getId(), normalizedQuery, PageRequest.of(0, normalizedLimit)).stream()
//                .map(user -> friendService.buildFriendUser(currentUser.getEmail(), user))
//                .collect(Collectors.toList());
//
//        List<SearchShelfItemResponse> music = musicCollectionRepository.searchPublicMusic(normalizedQuery, Visibility.PUBLIC, PageRequest.of(0, normalizedLimit)).stream()
//                .map(this::toMusicItem)
//                .collect(Collectors.toList());
//
//        List<SearchShelfItemResponse> books = bookshelfItemRepository.searchBooks(normalizedQuery, PageRequest.of(0, normalizedLimit)).stream()
//                .map(this::toBookItem)
//                .collect(Collectors.toList());
//
//        return SearchResponse.builder()
//                .query(normalizedQuery)
//                .users(users)
//                .posts(feedService.searchPublicPosts(currentUser.getEmail(), normalizedQuery, normalizedLimit))
//                .music(music)
//                .books(books)
//                .build();
//    }

    @Transactional(readOnly = true)
    public SearchResponse search(String email, String query, Integer limit) {

        User currentUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        String normalizedQuery = query == null
                ? ""
                : query.trim();

        int normalizedLimit = Math.max(
                1,
                Math.min(limit == null ? 5 : limit, 20)
        );

        if (normalizedQuery.isBlank()) {
            return SearchResponse.builder()
                    .query("")
                    .users(List.of())
                    .posts(List.of())
                    .music(List.of())
                    .books(List.of())
                    .build();
        }

        // Redis cache key
        String cacheKey =
                "search:"
                        + currentUser.getId()
                        + ":"
                        + normalizedQuery.toLowerCase()
                        + ":"
                        + normalizedLimit;

        // Redis hit
        String cached = redisTemplate.opsForValue().get(cacheKey);

        if (cached != null) {

            try {

                return objectMapper.readValue(
                        cached,
                        SearchResponse.class
                );

            } catch (JsonProcessingException e) {

                // Cache lỗi → xóa cache rồi query DB lại
                redisTemplate.delete(cacheKey);
            }
        }

        // Redis miss, query database
        List<FriendUserResponse> users =
                userRepository.searchUsers(
                                currentUser.getId(),
                                normalizedQuery,
                                PageRequest.of(0, normalizedLimit)
                        )
                        .stream()
                        .map(user ->
                                friendService.buildFriendUser(
                                        currentUser.getEmail(),
                                        user
                                )
                        )
                        .collect(Collectors.toList());

        List<SearchShelfItemResponse> music =
                musicCollectionRepository.searchPublicMusic(
                                normalizedQuery,
                                Visibility.PUBLIC,
                                PageRequest.of(0, normalizedLimit)
                        )
                        .stream()
                        .map(this::toMusicItem)
                        .collect(Collectors.toList());

        List<SearchShelfItemResponse> books =
                bookshelfItemRepository.searchBooks(
                                normalizedQuery,
                                PageRequest.of(0, normalizedLimit)
                        )
                        .stream()
                        .map(this::toBookItem)
                        .collect(Collectors.toList());

        SearchResponse result = SearchResponse.builder()
                .query(normalizedQuery)
                .users(users)
                .posts(
                        feedService.searchPublicPosts(
                                currentUser.getEmail(),
                                normalizedQuery,
                                normalizedLimit
                        )
                )
                .music(music)
                .books(books)
                .build();

        // Save to redis - 2 mins
        try {

            String json =
                    objectMapper.writeValueAsString(result);

            redisTemplate.opsForValue().set(
                    cacheKey,
                    json,
                    2,
                    TimeUnit.MINUTES
            );

        } catch (JsonProcessingException e) {

            // Cache lỗi không được làm Search thất bại
        }

        return result;
    }

    private SearchShelfItemResponse toMusicItem(UserMusicCollection item) {
        return SearchShelfItemResponse.builder()
                .id(item.getId())
                .type("music")
                .title(item.getTitle())
                .subtitle(item.getSubtitle())
                .coverUrl(item.getCoverUrl())
                .ownerUserId(item.getUser().getId())
                .ownerDisplayName(item.getUser().getDisplayName())
                .build();
    }

    private SearchShelfItemResponse toBookItem(UserBookshelfItem item) {
        Map<String, Object> payload = readPayload(item.getBookPayloadJson());
        return SearchShelfItemResponse.builder()
                .id(item.getId())
                .type("book")
                .title(firstNonBlank(text(payload, "title"), text(payload, "bookTitle"), item.getBookKey()))
                .subtitle(firstNonBlank(text(payload, "author"), text(payload, "writer"), text(payload, "subtitle")))
                .coverUrl(firstNonBlank(text(payload, "coverUrl"), text(payload, "cover"), text(payload, "image"), text(payload, "imageUrl")))
                .ownerUserId(item.getUser().getId())
                .ownerDisplayName(item.getUser().getDisplayName())
                .build();
    }

    private Map<String, Object> readPayload(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private String text(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }
}
