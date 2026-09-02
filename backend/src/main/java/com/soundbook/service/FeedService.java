package com.soundbook.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.feed.*;
import com.soundbook.dto.taste.MatchUserResponse;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.CommentStatus;
import com.soundbook.entity.enums.PostType;
import com.soundbook.entity.enums.ReactionType;
import com.soundbook.entity.enums.TargetType;
import com.soundbook.entity.enums.Visibility;
import com.soundbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FeedService {

    private static final int DEFAULT_LIMIT = 10;
    private static final int MAX_LIMIT = 50;
    private static final List<Visibility> FOLLOWING_VISIBLE = List.of(Visibility.PUBLIC, Visibility.FOLLOWERS);

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final UserTasteDnaRepository userTasteDnaRepository;
    private final PostRepository postRepository;
    private final PostMediaRepository postMediaRepository;
    private final CommentRepository commentRepository;
    private final ReactionRepository reactionRepository;
    private final FollowRepository followRepository;
    private final TasteDnaService tasteDnaService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Transactional(readOnly = true)
    public FeedResponse getFeed(String email, String tab, Integer limit, Integer offset) {
        // 1. Viewer
        User currentUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        String normalizedTab = normalizeTab(tab);
        int normalizedLimit = normalizeLimit(limit);
        int safeOffset = Math.max(0, offset == null ? 0 : offset);

        // 2. Candidate posts
        Set<Long> followingIds = "following".equals(normalizedTab)
                ? followRepository.findByIdFollowerId(currentUser.getId()).stream()
                        .map(follow -> follow.getFollowee().getId())
                        .collect(Collectors.toCollection(LinkedHashSet::new))
                : Collections.emptySet();

        List<Post> candidates = findCandidatePosts(
                currentUser,
                normalizedTab,
                normalizedLimit,
                safeOffset,
                followingIds
        );

        if (candidates.isEmpty() && "following".equals(normalizedTab) && safeOffset == 0) {
            candidates = findCandidatePosts(
                    currentUser,
                    "discover",
                    normalizedLimit,
                    0,
                    Collections.emptySet()
            );
        }

        // 3. Batch build DTOs
        List<FeedPostResponse> posts = buildPostResponsesBatch(currentUser, candidates);

        // 4. Friend suggestions (chỉ load ở trang đầu offset = 0)
        List<MatchUserResponse> filteredSuggestions = Collections.emptyList();
        if (safeOffset == 0) {
            try {
                filteredSuggestions = tasteDnaService.getRecommendedMatches(email, 6);
            } catch (Exception ignored) {
            }
        }

        return FeedResponse.builder()
                .tab(normalizedTab)
                .posts(posts)
                .friendSuggestions(filteredSuggestions)
                .trending(buildTrending(posts))
                .hasMore(!posts.isEmpty() && posts.size() == normalizedLimit)
                .build();
    }

    @Transactional(readOnly = true)
    public FeedPostResponse getPost(String email, Long postId) {
        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        Post post = postRepository.findById(postId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        return buildPostResponsesBatch(currentUser, List.of(post)).stream()
                .findFirst()
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
    }

    @Transactional(readOnly = true)
    public List<FeedPostResponse> getProfilePosts(String email, Long profileUserId, Integer limit) {
        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        int normalizedLimit = normalizeLimit(limit);
        List<Post> posts = postRepository.findByUser_IdOrderByCreatedAtDesc(profileUserId, PageRequest.of(0, normalizedLimit));
        return buildPostResponsesBatch(currentUser, posts);
    }

    @Transactional(readOnly = true)
    public List<FeedPostResponse> getProfilePostsPaged(String email, Long profileUserId, int page, int size) {
        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        int normalizedSize = Math.max(1, Math.min(size, 50));
        List<Post> posts = postRepository.findByUser_IdOrderByCreatedAtDesc(profileUserId, PageRequest.of(page, normalizedSize));
        return buildPostResponsesBatch(currentUser, posts);
    }

    @Transactional(readOnly = true)
    public List<FeedPostResponse> searchPublicPosts(String email, String keyword, Integer limit) {
        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        String normalizedKeyword = keyword == null ? "" : keyword.trim();
        if (normalizedKeyword.isBlank()) {
            return Collections.emptyList();
        }
        int normalizedLimit = normalizeLimit(limit);
        List<Post> posts = postRepository.searchPublicPosts(normalizedKeyword, Visibility.PUBLIC, PageRequest.of(0, normalizedLimit));
        return buildPostResponsesBatch(currentUser, posts);
    }

    // Optimize feed
    private List<FeedPostResponse> buildPostResponsesBatch(User currentUser, List<Post> posts) {
        if (posts == null || posts.isEmpty()) {
            return Collections.emptyList();
        }

        Long viewerId = currentUser.getId();
        List<Long> postIds = posts.stream().map(Post::getId).toList();
        Set<Long> authorIds = posts.stream().map(p -> p.getUser().getId()).collect(Collectors.toSet());

        // 1. Batch User Profiles (1 query)
        Map<Long, UserProfile> profileMap = userProfileRepository.findAllById(authorIds).stream()
                .collect(Collectors.toMap(UserProfile::getUserId, Function.identity(), (a, b) -> a));

        // 2. Batch Follow Status (1 query)
        Set<Long> followedAuthorIds = followRepository.findFollowedAuthorIds(viewerId, authorIds);

        // 3. Batch Post Media (1 query)
        List<PostMedia> medias = postMediaRepository.findByPost_IdInOrderByPost_IdAscIdAsc(postIds);
        Map<Long, PostMedia> firstMediaMap = new HashMap<>();
        for (PostMedia media : medias) {
            firstMediaMap.putIfAbsent(media.getPost().getId(), media);
        }

        // 4. Viewer Taste DNA (1 query)
        UserTasteDna viewerTaste = userTasteDnaRepository.findById(viewerId).orElse(null);
        Map<String, Double> viewerMusic = viewerTaste == null ? Collections.emptyMap() : readMap(viewerTaste.getMusicVectorJson());
        Map<String, Double> viewerBook = viewerTaste == null ? Collections.emptyMap() : readMap(viewerTaste.getBookVectorJson());

        // 5. Author Taste DNA (1 query)
        Map<Long, UserTasteDna> authorTasteMap = userTasteDnaRepository.findAllById(authorIds).stream()
                .collect(Collectors.toMap(UserTasteDna::getUserId, Function.identity(), (a, b) -> a));

        // 6. Reaction Summary (1 query GROUP BY)
        List<ReactionSummaryProjection> reactionRows = reactionRepository.findReactionSummary(TargetType.POST, postIds);
        Map<Long, Map<ReactionType, Long>> reactionSummaryMap = new HashMap<>();
        for (ReactionSummaryProjection row : reactionRows) {
            reactionSummaryMap
                    .computeIfAbsent(row.getTargetId(), id -> new EnumMap<>(ReactionType.class))
                    .put(row.getReactionType(), row.getTotal());
        }

        // 7. Comment Counts (1 query GROUP BY)
        Map<Long, Long> commentCountMap = commentRepository.countCommentsByPostIds(postIds, CommentStatus.DELETED).stream()
                .collect(Collectors.toMap(CommentCountProjection::getPostId, CommentCountProjection::getTotal, (a, b) -> a));

        // 8. Viewer Reactions (1 query)
        Map<Long, ReactionType> viewerReactionMap = reactionRepository.findViewerReactions(viewerId, TargetType.POST, postIds).stream()
                .collect(Collectors.toMap(Reaction::getTargetId, Reaction::getReactionType, (a, b) -> a));

        // 9. DTO Mapping hoàn toàn trong RAM (0 database queries)
        return posts.stream().map(post -> {
            Long postId = post.getId();
            Long authorId = post.getUser().getId();
            UserProfile profile = profileMap.get(authorId);
            PostMedia media = firstMediaMap.get(postId);
            boolean isFollowing = followedAuthorIds.contains(authorId);
            UserTasteDna authorTaste = authorTasteMap.get(authorId);

            double authorMatchScore = Objects.equals(authorId, viewerId)
                    ? 100.0
                    : calculateTasteSimilarity(viewerTaste, authorTaste);

            double tasteScore = calculateContentTasteScore(post, viewerMusic, viewerBook);

            Map<ReactionType, Long> reactionsMap = reactionSummaryMap.getOrDefault(postId, Collections.emptyMap());
            long commentCount = commentCountMap.getOrDefault(postId, 0L);

            FeedReactionSummaryResponse reactions = FeedReactionSummaryResponse.builder()
                    .like(reactionsMap.getOrDefault(ReactionType.LIKE, 0L))
                    .heart(reactionsMap.getOrDefault(ReactionType.HEART, 0L))
                    .fire(reactionsMap.getOrDefault(ReactionType.FIRE, 0L))
                    .haha(reactionsMap.getOrDefault(ReactionType.HAHA, 0L))
                    .wow(reactionsMap.getOrDefault(ReactionType.WOW, 0L))
                    .sad(reactionsMap.getOrDefault(ReactionType.SAD, 0L))
                    .angry(reactionsMap.getOrDefault(ReactionType.ANGRY, 0L))
                    .comments(commentCount)
                    .shares(post.getShareCount() == null ? 0L : post.getShareCount())
                    .build();

            double engagementScore = Math.min(20, (reactions.getLike() + reactions.getHeart() + reactions.getFire()
                    + reactions.getHaha() + reactions.getWow() + reactions.getSad() + reactions.getAngry() + reactions.getComments()) * 2.5);
            double freshnessScore = freshnessScore(post.getCreatedAt());
            double finalScore = (authorMatchScore * 0.55) + (tasteScore * 0.30) + (engagementScore * 0.10) + (freshnessScore * 0.05);

            ReactionType currentReact = viewerReactionMap.get(postId);
            List<String> sharedFeatures = findSharedFeatures(viewerTaste, authorTaste);

            return FeedPostResponse.builder()
                    .id(postId)
                    .type(mapFeedType(post.getType()))
                    .caption(post.getCaption())
                    .contentRich(post.getContentRich())
                    .moodTag(post.getMoodTag())
                    .refJson(post.getRefJson())
                    .user(buildUserResponse(post.getUser(), viewerId, profile, isFollowing))
                    .media(buildMediaResponse(post, media))
                    .reactions(reactions)
                    .comments(Collections.emptyList())
                    .commentsEnabled(Boolean.TRUE.equals(post.getCommentsEnabled()))
                    .currentUserReaction(currentReact != null ? currentReact.name() : null)
                    .canEdit(Objects.equals(authorId, viewerId))
                    .tasteScore(round2(tasteScore))
                    .authorMatch(round2(authorMatchScore))
                    .finalScore(round2(finalScore))
                    .reason(buildReason(post, authorMatchScore, sharedFeatures, tasteScore))
                    .createdAt(post.getCreatedAt())
                    .build();
        }).collect(Collectors.toList());
    }

    private List<Post> findCandidatePosts(User currentUser, String tab, int limit, int offset, Set<Long> followingIds) {
        int page = offset / limit;
        PageRequest pageRequest = PageRequest.of(page, limit);
        if ("following".equals(tab)) {
            Set<Long> authorIds = new LinkedHashSet<>(followingIds);
            authorIds.add(currentUser.getId());
            if (authorIds.isEmpty()) {
                return Collections.emptyList();
            }
            return postRepository.findByUser_IdInAndVisibilityInOrderByCreatedAtDesc(
                    authorIds,
                    FOLLOWING_VISIBLE,
                    pageRequest
            );
        }
        return postRepository.findByVisibilityOrderByCreatedAtDesc(Visibility.PUBLIC, pageRequest);
    }

    private FeedUserResponse buildUserResponse(User author, Long viewerId, UserProfile profile, boolean isFollowing) {
        boolean self = Objects.equals(author.getId(), viewerId);
        return FeedUserResponse.builder()
                .userId(author.getId())
                .displayName(author.getDisplayName())
                .username(profile == null ? null : profile.getUsername())
                .avatarUrl(profile == null ? null : profile.getAvatarUrl())
                .following(!self && isFollowing)
                .self(self)
                .build();
    }

    private FeedMediaResponse buildMediaResponse(Post post, PostMedia media) {
        RefPayload refPayload = parseRefPayload(post.getRefJson());
        return FeedMediaResponse.builder()
                .id(refPayload.id())
                .mediaType(media != null ? media.getMediaType().name() : null)
                .url(media != null ? media.getUrl() : null)
                .title(firstNonBlank(refPayload.title(), defaultMediaTitle(post)))
                .subtitle(firstNonBlank(refPayload.subtitle(), refPayload.artist(), refPayload.author()))
                .coverUrl(firstNonBlank(refPayload.coverUrl(), media != null ? media.getUrl() : null))
                .rating(refPayload.rating())
                .build();
    }

    private List<FeedTrendingResponse> buildTrending(List<FeedPostResponse> posts) {
        return posts.stream()
                .limit(5)
                .map(post -> FeedTrendingResponse.builder()
                        .postId(post.getId())
                        .title(firstNonBlank(post.getMedia() == null ? null : post.getMedia().getTitle(), truncate(post.getCaption(), 48), "Bài viết #" + post.getId()))
                        .subtitle(post.getUser() == null ? "Soundbook" : post.getUser().getDisplayName())
                        .type(post.getType())
                        .build())
                .collect(Collectors.toList());
    }

    private double calculateTasteSimilarity(UserTasteDna viewerTaste, UserTasteDna authorTaste) {
        if (viewerTaste == null || authorTaste == null) {
            return 0.0;
        }
        Map<String, Double> viewerMusic = readMap(viewerTaste.getMusicVectorJson());
        Map<String, Double> authorMusic = readMap(authorTaste.getMusicVectorJson());
        Map<String, Double> viewerBook = readMap(viewerTaste.getBookVectorJson());
        Map<String, Double> authorBook = readMap(authorTaste.getBookVectorJson());

        double musicSim = cosineSimilarity(viewerMusic, authorMusic);
        double bookSim = cosineSimilarity(viewerBook, authorBook);

        return round2((musicSim * 50.0) + (bookSim * 50.0));
    }

    private double cosineSimilarity(Map<String, Double> v1, Map<String, Double> v2) {
        if (v1 == null || v1.isEmpty() || v2 == null || v2.isEmpty()) {
            return 0.0;
        }
        double dot = 0.0;
        double norm1 = 0.0;
        double norm2 = 0.0;
        for (Map.Entry<String, Double> e : v1.entrySet()) {
            double val1 = e.getValue();
            norm1 += val1 * val1;
            Double val2 = v2.get(e.getKey());
            if (val2 != null) {
                dot += val1 * val2;
            }
        }
        for (double val2 : v2.values()) {
            norm2 += val2 * val2;
        }
        if (norm1 <= 0 || norm2 <= 0) {
            return 0.0;
        }
        return Math.min(1.0, dot / (Math.sqrt(norm1) * Math.sqrt(norm2)));
    }

    private List<String> findSharedFeatures(UserTasteDna viewerTaste, UserTasteDna authorTaste) {
        if (viewerTaste == null || authorTaste == null) return Collections.emptyList();
        Map<String, Double> v1 = readMap(viewerTaste.getMusicVectorJson());
        Map<String, Double> v2 = readMap(authorTaste.getMusicVectorJson());
        List<String> shared = new ArrayList<>();
        for (String k : v1.keySet()) {
            if (v2.containsKey(k)) {
                String clean = k.contains(":") ? k.substring(k.indexOf(':') + 1) : k;
                if (!clean.isBlank()) shared.add(clean);
            }
        }
        return shared.stream().limit(3).toList();
    }

    private double calculateContentTasteScore(Post post, Map<String, Double> currentMusic, Map<String, Double> currentBook) {
        double score = 0;
        String searchable = slug(String.join(" ",
                nullToBlank(post.getCaption()),
                nullToBlank(post.getContentRich()),
                nullToBlank(post.getMoodTag()),
                nullToBlank(post.getRefJson()),
                post.getType() == null ? "" : post.getType().name()
        ));

        if (isMusicPost(post.getType()) && !currentMusic.isEmpty()) {
            score += 18;
        }
        if (isBookPost(post.getType()) && !currentBook.isEmpty()) {
            score += 18;
        }

        score += vectorTextOverlap(searchable, currentMusic, 38);
        score += vectorTextOverlap(searchable, currentBook, 44);
        return Math.min(100, score);
    }

    private double vectorTextOverlap(String searchable, Map<String, Double> vector, double maxContribution) {
        if (searchable == null || searchable.isBlank() || vector == null || vector.isEmpty()) {
            return 0;
        }
        double matched = 0;
        for (Map.Entry<String, Double> entry : vector.entrySet()) {
            String feature = entry.getKey();
            String featureValue = feature.contains(":") ? feature.substring(feature.indexOf(':') + 1) : feature;
            if (!featureValue.isBlank() && searchable.contains(featureValue)) {
                matched += entry.getValue();
            }
        }
        return Math.min(maxContribution, matched * maxContribution * 2);
    }

    private String buildReason(Post post, double authorMatchScore, List<String> sharedFeatures, double tasteScore) {
        if (authorMatchScore >= 60) {
            String shared = sharedFeatures == null || sharedFeatures.isEmpty()
                    ? "gu tương đồng"
                    : String.join(", ", sharedFeatures);
            return "Tác giả có " + Math.round(authorMatchScore) + "% Match với bạn · Chung gu: " + shared;
        }
        if (tasteScore >= 20) {
            return "Nội dung hợp gu với bạn.";
        }
        if (isMusicPost(post.getType())) {
            return "Nội dung âm nhạc mới từ cộng đồng Soundbook.";
        }
        if (isBookPost(post.getType())) {
            return "Nội dung sách/truyện mới từ cộng đồng Soundbook.";
        }
        return "Bài viết mới từ cộng đồng Soundbook.";
    }

    private String mapFeedType(PostType type) {
        if (isMusicPost(type)) {
            return "audio";
        }
        if (type == PostType.BLOG) {
            return "blog";
        }
        return "book_review";
    }

    private boolean isMusicPost(PostType type) {
        return type == PostType.MUSIC_QUICK_NOTE;
    }

    private boolean isBookPost(PostType type) {
        return type == PostType.BOOK_READING_UPDATE || type == PostType.BOOK_QUOTE_CARD || type == PostType.BOOK_REVIEW;
    }

    private String defaultMediaTitle(Post post) {
        if (post.getType() == PostType.MUSIC_QUICK_NOTE) {
            return "Bài chia sẻ âm nhạc";
        }
        if (isBookPost(post.getType())) {
            return "Bài chia sẻ sách/truyện";
        }
        return "Bài viết Soundbook";
    }

    private RefPayload parseRefPayload(Object refJsonObj) {
        if (refJsonObj == null) {
            return RefPayload.empty();
        }
        try {
            Map<String, Object> payload;
            if (refJsonObj instanceof Map) {
                payload = (Map<String, Object>) refJsonObj;
            } else {
                String refJson = String.valueOf(refJsonObj);
                if (refJson.isBlank()) return RefPayload.empty();
                payload = objectMapper.readValue(refJson, new TypeReference<LinkedHashMap<String, Object>>() {});
            }

            return new RefPayload(
                    textValue(payload, "id", "videoId", "itemId"),
                    textValue(payload, "title", "name", "bookTitle", "trackTitle"),
                    textValue(payload, "subtitle", "description"),
                    textValue(payload, "artist", "singer"),
                    textValue(payload, "author", "writer"),
                    textValue(payload, "coverUrl", "cover", "image", "imageUrl", "thumbnail"),
                    intValue(payload, "rating")
            );
        } catch (Exception exception) {
            return RefPayload.empty();
        }
    }

    private String textValue(Map<String, Object> payload, String... keys) {
        for (String key : keys) {
            Object value = payload.get(key);
            if (value != null && !String.valueOf(value).isBlank()) {
                return String.valueOf(value);
            }
        }
        return null;
    }

    private Integer intValue(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        if (value == null) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Map<String, Double> readMap(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Double>>() {});
        } catch (Exception exception) {
            return Collections.emptyMap();
        }
    }

    private String normalizeTab(String tab) {
        return "following".equalsIgnoreCase(tab) ? "following" : "discover";
    }

    private int normalizeLimit(Integer limit) {
        return Math.max(1, Math.min(limit == null ? DEFAULT_LIMIT : limit, MAX_LIMIT));
    }

    private double freshnessScore(LocalDateTime createdAt) {
        if (createdAt == null) {
            return 0;
        }
        long hours = Math.max(0, Duration.between(createdAt, LocalDateTime.now()).toHours());
        if (hours <= 24) {
            return 20;
        }
        if (hours <= 72) {
            return 14;
        }
        if (hours <= 24 * 7) {
            return 8;
        }
        return 3;
    }

    private String slug(String value) {
        if (value == null) {
            return "";
        }
        String normalized = Normalizer.normalize(value.trim().toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('đ', 'd');
        return normalized
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
    }

    private double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private String nullToBlank(String value) {
        return value == null ? "" : value;
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength - 1) + "…";
    }

    private record RefPayload(String id, String title, String subtitle, String artist, String author, String coverUrl, Integer rating) {
        static RefPayload empty() {
            return new RefPayload(null, null, null, null, null, null, null);
        }
    }
}
