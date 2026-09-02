package com.soundbook.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.feed.*;
import com.soundbook.dto.taste.MatchUserResponse;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.PostType;
import com.soundbook.entity.enums.ReactionType;
import com.soundbook.entity.enums.TargetType;
import com.soundbook.entity.enums.Visibility;
import com.soundbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class FeedService {

    private static final int DEFAULT_LIMIT = 20;
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
    private final FriendshipRepository friendshipRepository;
    private final FriendRequestRepository friendRequestRepository;
    private final TasteDnaService tasteDnaService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RedisTemplate<String, Object> redisTemplate;

//    @Transactional(readOnly = true)
//    public FeedResponse getFeed(String email, String tab, Integer limit) {
//        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
//        String normalizedTab = normalizeTab(tab);
//        int normalizedLimit = normalizeLimit(limit);
//
//        Set<Long> followingIds = followRepository.findByIdFollowerId(currentUser.getId()).stream()
//                .map(follow -> follow.getFollowee().getId())
//                .collect(Collectors.toCollection(LinkedHashSet::new));
//
//        List<MatchUserResponse> matchSuggestions = tasteDnaService.getRecommendedMatches(email, 24);
//        Map<Long, MatchUserResponse> matchByUserId = matchSuggestions.stream()
//                .collect(Collectors.toMap(MatchUserResponse::getUserId, Function.identity(), (left, right) -> left, LinkedHashMap::new));
//
//        List<Post> candidates = findCandidatePosts(currentUser, normalizedTab, normalizedLimit, followingIds);
//        if (candidates.isEmpty() && "following".equals(normalizedTab)) {
//            candidates = findCandidatePosts(currentUser, "discover", normalizedLimit, followingIds);
//        }
//
//        UserTasteDna currentTaste = userTasteDnaRepository.findById(currentUser.getId()).orElse(null);
//        Map<String, Double> currentMusic = currentTaste == null ? Collections.emptyMap() : readMap(currentTaste.getMusicVectorJson());
//        Map<String, Double> currentBook = currentTaste == null ? Collections.emptyMap() : readMap(currentTaste.getBookVectorJson());
//
//        List<FeedPostResponse> posts = candidates.stream()
//                .map(post -> buildPostResponse(post, currentUser, currentMusic, currentBook, matchByUserId))
//                .sorted(feedComparator(normalizedTab))
//                .limit(normalizedLimit)
//                .collect(Collectors.toList());
//
//        List<MatchUserResponse> filteredSuggestions = matchSuggestions.stream()
//                .filter(match -> !followingIds.contains(match.getUserId()))
//                .filter(match -> !match.getUserId().equals(currentUser.getId()))
//                .filter(match -> !friendshipRepository.existsByIdUserIdAndIdFriendId(currentUser.getId(), match.getUserId()))
//                .filter(match -> friendRequestRepository.findFirstByRequester_IdAndReceiver_IdAndStatus(currentUser.getId(), match.getUserId(), com.soundbook.entity.enums.FriendRequestStatus.PENDING).isEmpty())
//                .filter(match -> friendRequestRepository.findFirstByRequester_IdAndReceiver_IdAndStatus(match.getUserId(), currentUser.getId(), com.soundbook.entity.enums.FriendRequestStatus.PENDING).isEmpty())
//                .limit(6)
//                .collect(Collectors.toList());
//
//        return FeedResponse.builder()
//                .tab(normalizedTab)
//                .posts(posts)
//                .friendSuggestions(filteredSuggestions)
//                .trending(buildTrending(posts))
//                .build();
//    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public FeedResponse getFeed(String email, String tab, Integer limit, Integer offset) {

        User currentUser = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        String normalizedTab = normalizeTab(tab);
        int normalizedLimit = normalizeLimit(limit);

        String cacheKey = "feed:"
                + currentUser.getId()
                + ":"
                + normalizedTab;

        // Check redis
        Object cached = redisTemplate.opsForValue().get(cacheKey);

        if (cached != null) {

            System.out.println("Redis HIT: " + cacheKey);

            FeedResponse cachedFeed = (FeedResponse) cached;

            List<FeedPostResponse> cachedPosts = cachedFeed.getPosts() == null
                    ? Collections.emptyList()
                    : cachedFeed.getPosts()
                    .stream()
                    .limit(normalizedLimit)
                    .collect(Collectors.toList());

            return FeedResponse.builder()
                    .tab(cachedFeed.getTab())
                    .posts(cachedPosts)
                    .friendSuggestions(cachedFeed.getFriendSuggestions())
                    .trending(buildTrending(cachedPosts))
                    .build();
        }

        System.out.println("Redis MISS: " + cacheKey);

        // Redis miss
        Set<Long> followingIds = followRepository
                .findByIdFollowerId(currentUser.getId())
                .stream()
                .map(follow -> follow.getFollowee().getId())
                .collect(Collectors.toCollection(LinkedHashSet::new));

        List<MatchUserResponse> matchSuggestions =
                tasteDnaService.getRecommendedMatches(email, 24);

        Map<Long, MatchUserResponse> matchByUserId =
                matchSuggestions.stream()
                        .collect(Collectors.toMap(
                                MatchUserResponse::getUserId,
                                Function.identity(),
                                (left, right) -> left,
                                LinkedHashMap::new
                        ));

        int cacheLimit = MAX_LIMIT;

        List<Post> candidates = findCandidatePosts(
                currentUser,
                normalizedTab,
                cacheLimit,
                followingIds
        );

        if (candidates.isEmpty() && "following".equals(normalizedTab)) {
            candidates = findCandidatePosts(
                    currentUser,
                    "discover",
                    cacheLimit,
                    followingIds
            );
        }

        UserTasteDna currentTaste =
                userTasteDnaRepository.findById(currentUser.getId())
                        .orElse(null);

        Map<String, Double> currentMusic =
                currentTaste == null
                        ? Collections.emptyMap()
                        : readMap(currentTaste.getMusicVectorJson());

        Map<String, Double> currentBook =
                currentTaste == null
                        ? Collections.emptyMap()
                        : readMap(currentTaste.getBookVectorJson());

        List<FeedPostResponse> posts = candidates.stream()
                .map(post -> buildPostResponse(
                        post,
                        currentUser,
                        currentMusic,
                        currentBook,
                        matchByUserId
                ))
                .sorted(feedComparator(normalizedTab))
                .limit(cacheLimit)
                .collect(Collectors.toList());

        List<MatchUserResponse> filteredSuggestions =
                matchSuggestions.stream()
                        .filter(match -> !followingIds.contains(match.getUserId()))
                        .filter(match -> !match.getUserId().equals(currentUser.getId()))
                        .filter(match -> !friendshipRepository.existsByIdUserIdAndIdFriendId(
                                currentUser.getId(),
                                match.getUserId()
                        ))
                        .filter(match -> friendRequestRepository
                                .findFirstByRequester_IdAndReceiver_IdAndStatus(
                                        currentUser.getId(),
                                        match.getUserId(),
                                        com.soundbook.entity.enums.FriendRequestStatus.PENDING
                                )
                                .isEmpty()
                        )
                        .filter(match -> friendRequestRepository
                                .findFirstByRequester_IdAndReceiver_IdAndStatus(
                                        match.getUserId(),
                                        currentUser.getId(),
                                        com.soundbook.entity.enums.FriendRequestStatus.PENDING
                                )
                                .isEmpty()
                        )
                        .limit(6)
                        .collect(Collectors.toList());

        // Full feed
        FeedResponse feed = FeedResponse.builder()
                .tab(normalizedTab)
                .posts(posts)
                .friendSuggestions(filteredSuggestions)
                .trending(buildTrending(posts))
                .build();

       // Save to redis - 2 mins
        redisTemplate.opsForValue().set(
                cacheKey,
                feed,
                2,
                TimeUnit.MINUTES
        );

        List<FeedPostResponse> pagedPosts = feed.getPosts()
                        .stream()
                        .skip(Math.max(0, offset == null ? 0 : offset))
                        .limit(normalizedLimit)
                        .collect(Collectors.toList());

        return FeedResponse.builder()
                .tab(feed.getTab())
                .posts(pagedPosts)
                .friendSuggestions(feed.getFriendSuggestions())
                .trending(buildTrending(
                        feed.getPosts()
                                .stream()
                                .limit(normalizedLimit)
                                .collect(Collectors.toList())
                ))
                .hasMore(!pagedPosts.isEmpty() && pagedPosts.size() == normalizedLimit)
                .build();
    }


    @Transactional(readOnly = true)
    public FeedPostResponse getPost(String email, Long postId) {
        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        Post post = postRepository.findById(postId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        return buildPostResponsesForRequester(currentUser, List.of(post), 1).stream()
                .findFirst()
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
    }

    @Transactional(readOnly = true)
    public List<FeedPostResponse> getProfilePosts(String email, Long profileUserId, Integer limit) {
        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        int normalizedLimit = normalizeLimit(limit);
        List<Post> posts = postRepository.findByUser_IdOrderByCreatedAtDesc(profileUserId, PageRequest.of(0, normalizedLimit));
        return buildPostResponsesForRequester(currentUser, posts, normalizedLimit);
    }

    @Transactional(readOnly = true)
    public List<FeedPostResponse> getProfilePostsPaged(String email, Long profileUserId, int page, int size) {
        User currentUser = userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        int normalizedSize = Math.max(1, Math.min(size, 50));
        List<Post> posts = postRepository.findByUser_IdOrderByCreatedAtDesc(profileUserId, PageRequest.of(page, normalizedSize));
        return buildPostResponsesForRequester(currentUser, posts, normalizedSize);
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
        return buildPostResponsesForRequester(currentUser, posts, normalizedLimit);
    }

    private List<FeedPostResponse> buildPostResponsesForRequester(User currentUser, List<Post> posts, int limit) {
        UserTasteDna currentTaste = userTasteDnaRepository.findById(currentUser.getId()).orElse(null);
        Map<String, Double> currentMusic = currentTaste == null ? Collections.emptyMap() : readMap(currentTaste.getMusicVectorJson());
        Map<String, Double> currentBook = currentTaste == null ? Collections.emptyMap() : readMap(currentTaste.getBookVectorJson());

        Map<Long, MatchUserResponse> matchByUserId = new LinkedHashMap<>();
        for (Post post : posts) {
            Long authorId = post.getUser().getId();
            if (!authorId.equals(currentUser.getId()) && !matchByUserId.containsKey(authorId)) {
                try {
                    MatchUserResponse match = tasteDnaService.getMatchWithUser(currentUser.getEmail(), authorId);
                    if (match != null) {
                        matchByUserId.put(authorId, match);
                    }
                } catch (Exception ignored) {
                    // Taste DNA is optional for legacy users/posts.
                }
            }
        }

        return posts.stream()
                .map(post -> buildPostResponse(post, currentUser, currentMusic, currentBook, matchByUserId))
                .limit(limit)
                .collect(Collectors.toList());
    }

    private List<Post> findCandidatePosts(User currentUser, String tab, int limit, Set<Long> followingIds) {
        int candidateSize = Math.min(MAX_LIMIT * 3, Math.max(limit * 3, 30));
        if ("following".equals(tab)) {
            Set<Long> authorIds = new LinkedHashSet<>(followingIds);
            authorIds.add(currentUser.getId());
            if (authorIds.isEmpty()) {
                return Collections.emptyList();
            }
            return postRepository.findByUser_IdInAndVisibilityInOrderByCreatedAtDesc(
                    authorIds,
                    FOLLOWING_VISIBLE,
                    PageRequest.of(0, candidateSize)
            );
        }
        return postRepository.findByVisibilityOrderByCreatedAtDesc(Visibility.PUBLIC, PageRequest.of(0, candidateSize));
    }

    private Comparator<FeedPostResponse> feedComparator(String tab) {
        if ("following".equals(tab)) {
            return Comparator.comparing(FeedPostResponse::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()));
        }
        return Comparator.comparingDouble(FeedPostResponse::getFinalScore).reversed()
                .thenComparing(FeedPostResponse::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private FeedPostResponse buildPostResponse(Post post,
                                               User currentUser,
                                               Map<String, Double> currentMusic,
                                               Map<String, Double> currentBook,
                                               Map<Long, MatchUserResponse> matchByUserId) {
        MatchUserResponse authorMatch = matchByUserId.get(post.getUser().getId());
        double authorMatchScore = authorMatch == null ? (post.getUser().getId().equals(currentUser.getId()) ? 100 : 0) : authorMatch.getFinalMatch();
        double tasteScore = calculateContentTasteScore(post, currentMusic, currentBook);
        FeedReactionSummaryResponse reactions = buildReactionSummary(post.getId());
        double engagementScore = Math.min(20, (reactions.getLike() + reactions.getHeart() + reactions.getFire() + reactions.getHaha() + reactions.getWow() + reactions.getSad() + reactions.getAngry() + reactions.getComments()) * 2.5);
        double freshnessScore = freshnessScore(post.getCreatedAt());
        double finalScore = (authorMatchScore * 0.55) + (tasteScore * 0.30) + (engagementScore * 0.10) + (freshnessScore * 0.05);

        return FeedPostResponse.builder()
                .id(post.getId())
                .type(mapFeedType(post.getType()))
                .caption(post.getCaption())
                .contentRich(post.getContentRich())
                .moodTag(post.getMoodTag())
                .refJson(post.getRefJson())
                .user(buildUserResponse(post.getUser(), currentUser))
                .media(buildMediaResponse(post))
                .reactions(reactions)
                .comments(buildComments(post.getId(), currentUser))
                .commentsEnabled(Boolean.TRUE.equals(post.getCommentsEnabled()))
                .currentUserReaction(currentUserReaction(currentUser.getId(), post.getId()))
                .canEdit(post.getUser().getId().equals(currentUser.getId()))
                .tasteScore(round2(tasteScore))
                .authorMatch(round2(authorMatchScore))
                .finalScore(round2(finalScore))
                .reason(buildReason(post, authorMatch, tasteScore))
                .createdAt(post.getCreatedAt())
                .build();
    }

    private FeedUserResponse buildUserResponse(User user, User currentUser) {
        UserProfile profile = userProfileRepository.findById(user.getId()).orElse(null);
        boolean self = currentUser != null && Objects.equals(user.getId(), currentUser.getId());
        boolean following = !self && currentUser != null && followRepository.existsByIdFollowerIdAndIdFolloweeId(currentUser.getId(), user.getId());
        return FeedUserResponse.builder()
                .userId(user.getId())
                .displayName(user.getDisplayName())
                .username(profile == null ? null : profile.getUsername())
                .avatarUrl(profile == null ? null : profile.getAvatarUrl())
                .following(following)
                .self(self)
                .build();
    }

    private FeedUserResponse buildUserResponse(User user) {
        UserProfile profile = userProfileRepository.findById(user.getId()).orElse(null);
        return FeedUserResponse.builder()
                .userId(user.getId())
                .displayName(user.getDisplayName())
                .username(profile == null ? null : profile.getUsername())
                .avatarUrl(profile == null ? null : profile.getAvatarUrl())
                .build();
    }

    private FeedMediaResponse buildMediaResponse(Post post) {
        Optional<PostMedia> media = postMediaRepository.findFirstByPost_IdOrderByIdAsc(post.getId());
        RefPayload refPayload = parseRefPayload(post.getRefJson());
        return FeedMediaResponse.builder()
                .id(refPayload.id())
                .mediaType(media.map(item -> item.getMediaType().name()).orElse(null))
                .url(media.map(PostMedia::getUrl).orElse(null))
                .title(firstNonBlank(refPayload.title(), defaultMediaTitle(post)))
                .subtitle(firstNonBlank(refPayload.subtitle(), refPayload.artist(), refPayload.author()))
                .coverUrl(firstNonBlank(refPayload.coverUrl(), media.map(PostMedia::getUrl).orElse(null)))
                .rating(refPayload.rating())
                .build();
    }

    private FeedReactionSummaryResponse buildReactionSummary(Long postId) {
        return FeedReactionSummaryResponse.builder()
                .like(reactionRepository.countByTargetTypeAndTargetIdAndReactionType(TargetType.POST, postId, ReactionType.LIKE))
                .heart(reactionRepository.countByTargetTypeAndTargetIdAndReactionType(TargetType.POST, postId, ReactionType.HEART))
                .fire(reactionRepository.countByTargetTypeAndTargetIdAndReactionType(TargetType.POST, postId, ReactionType.FIRE))
                .haha(reactionRepository.countByTargetTypeAndTargetIdAndReactionType(TargetType.POST, postId, ReactionType.HAHA))
                .wow(reactionRepository.countByTargetTypeAndTargetIdAndReactionType(TargetType.POST, postId, ReactionType.WOW))
                .sad(reactionRepository.countByTargetTypeAndTargetIdAndReactionType(TargetType.POST, postId, ReactionType.SAD))
                .angry(reactionRepository.countByTargetTypeAndTargetIdAndReactionType(TargetType.POST, postId, ReactionType.ANGRY))
                .comments(commentRepository.countByPostId(postId))
                .shares(postRepository.findById(postId).map(post -> post.getShareCount() == null ? 0L : post.getShareCount()).orElse(0L))
                .build();
    }


    private String currentUserReaction(Long userId, Long postId) {
        return reactionRepository.findByUser_IdAndTargetTypeAndTargetId(userId, TargetType.POST, postId)
                .map(reaction -> reaction.getReactionType().name())
                .orElse(null);
    }

    private List<FeedCommentResponse> buildComments(Long postId, User currentUser) {
        List<Comment> comments = commentRepository.findByPostIdAndParentIsNullOrderByCreatedAtDescList(postId);
        Collections.reverse(comments);
        return comments.stream()
                    .map(comment -> FeedCommentResponse.builder()
                        .id(comment.getId())
                        .parentId(comment.getParent() != null ? comment.getParent().getId() : null)
                        .user(buildUserResponse(comment.getUser()))
                        .text(comment.getContent())
                        .createdAt(comment.getCreatedAt())
                        .replyCount(commentRepository.countByParent_IdAndStatusNot(comment.getId(), com.soundbook.entity.enums.CommentStatus.DELETED))
                        .reactsCount(reactionRepository.countByTargetIdAndTargetType(comment.getId(), TargetType.COMMENT))
                        .currentUserReaction(reactionRepository.findByUser_IdAndTargetTypeAndTargetId(currentUser.getId(), TargetType.COMMENT, comment.getId())
                                .map(r -> r.getReactionType().name()).orElse(null))
                        .build())
                .collect(Collectors.toList());
    }

    private List<FeedTrendingResponse> buildTrending(List<FeedPostResponse> posts) {
        return posts.stream()
                .sorted(Comparator.comparingLong(this::engagementCount).reversed()
                        .thenComparing(FeedPostResponse::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(5)
                .map(post -> FeedTrendingResponse.builder()
                        .postId(post.getId())
                        .title(firstNonBlank(post.getMedia() == null ? null : post.getMedia().getTitle(), truncate(post.getCaption(), 48), "Bài viết #" + post.getId()))
                        .subtitle(post.getUser() == null ? "Soundbook" : post.getUser().getDisplayName())
                        .type(post.getType())
                        .engagementCount(engagementCount(post))
                        .build())
                .collect(Collectors.toList());
    }

    private long engagementCount(FeedPostResponse post) {
        if (post == null || post.getReactions() == null) {
            return 0;
        }
        return post.getReactions().getLike()
                + post.getReactions().getHeart()
                + post.getReactions().getFire()
                + post.getReactions().getHaha()
                + post.getReactions().getWow()
                + post.getReactions().getSad()
                + post.getReactions().getAngry()
                + post.getReactions().getComments()
                + post.getReactions().getShares();
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

    private String buildReason(Post post, MatchUserResponse authorMatch, double tasteScore) {
        if (authorMatch != null && authorMatch.getFinalMatch() >= 60) {
            String shared = authorMatch.getSharedFeatures() == null || authorMatch.getSharedFeatures().isEmpty()
                    ? "gu tương đồng"
                    : String.join(", ", authorMatch.getSharedFeatures().stream().limit(3).toList());
            return "Tác giả có " + Math.round(authorMatch.getFinalMatch()) + "% Match với bạn · Chung gu: " + shared;
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
