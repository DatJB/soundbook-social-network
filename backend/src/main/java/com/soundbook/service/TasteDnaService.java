package com.soundbook.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.taste.DiscoverItemResponse;
import com.soundbook.dto.taste.MatchUserResponse;
import com.soundbook.dto.taste.PreferenceRequest;
import com.soundbook.dto.taste.TasteProfileResponse;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.DnaBuiltFrom;
import com.soundbook.entity.enums.PostType;
import com.soundbook.entity.enums.TargetType;
import com.soundbook.entity.enums.Visibility;
import com.soundbook.messaging.RabbitMQProducer;
import com.soundbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TasteDnaService {

    private static final int DEFAULT_MATCH_LIMIT = 20;
    private static final int MAX_MATCH_LIMIT = 50;

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final UserOnboardingRepository userOnboardingRepository;
    private final UserMusicDnaRepository userMusicDnaRepository;
    private final UserBookDnaRepository userBookDnaRepository;
    private final UserTasteDnaRepository userTasteDnaRepository;
    private final PostRepository postRepository;
    private final CommentRepository commentRepository;
    private final ReactionRepository reactionRepository;
    private final FriendshipRepository friendshipRepository;
    private final FriendRequestRepository friendRequestRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RedisTemplate<String, Object> redisTemplate;
    private final RabbitMQProducer rabbitMQProducer;

    @Transactional(readOnly = true)
    public TasteProfileResponse getMyTaste(String email) {
        User user = findUserByEmail(email);
        return buildTasteProfileResponse(user);
    }

    @Transactional
    public TasteProfileResponse saveMyTaste(String email, PreferenceRequest request) {
        User user = findUserByEmail(email);
        validatePreferenceRequest(request);

        PreferenceSnapshot musicPrefs = PreferenceSnapshot.builder()
                .genres(clean(request.getMusicGenres()))
                .moods(clean(request.getMusicMoods()))
                .artists(clean(request.getMusicArtists()))
                .songs(clean(request.getMusicSongs()))
                .dislikedGenres(clean(request.getMusicDislikedGenres()))
                .build();

        PreferenceSnapshot bookPrefs = PreferenceSnapshot.builder()
                .genres(clean(request.getBookGenres()))
                .themes(clean(request.getBookThemes()))
                .authors(clean(request.getBookAuthors()))
                .books(clean(request.getFavoriteBooks()))
                .dislikedGenres(clean(request.getBookDislikedGenres()))
                .build();

        Map<String, Double> musicVector = buildMusicVector(musicPrefs);
        Map<String, Double> bookVector = buildBookVector(bookPrefs);
        BigDecimal musicConfidence = confidenceForMusic(musicPrefs);
        BigDecimal bookConfidence = confidenceForBook(bookPrefs);
        WeightPair weights = normalizeWeights(request.getWeightMusic(), request.getWeightBook());
        LocalDateTime now = LocalDateTime.now();

        UserMusicDna musicDna = userMusicDnaRepository.findById(user.getId()).orElseGet(() -> UserMusicDna.builder()
                .user(user)
                .builtFrom(DnaBuiltFrom.MANUAL)
                .version(0)
                .build());
        musicDna.setBuiltFrom(DnaBuiltFrom.MANUAL);
        musicDna.setPrefsJson(toJson(musicPrefs));
        musicDna.setVectorJson(toJson(musicVector));
        musicDna.setConfidence(musicConfidence);
        musicDna.setVersion(nextVersion(musicDna.getVersion()));
        musicDna.setCalculatedAt(now);
        userMusicDnaRepository.save(musicDna);

        UserBookDna bookDna = userBookDnaRepository.findById(user.getId()).orElseGet(() -> UserBookDna.builder()
                .user(user)
                .version(0)
                .build());
        bookDna.setPrefsJson(toJson(bookPrefs));
        bookDna.setVectorJson(toJson(bookVector));
        bookDna.setConfidence(bookConfidence);
        bookDna.setVersion(nextVersion(bookDna.getVersion()));
        bookDna.setCalculatedAt(now);
        userBookDnaRepository.save(bookDna);

        UserTasteDna tasteDna = userTasteDnaRepository.findById(user.getId()).orElseGet(() -> UserTasteDna.builder()
                .user(user)
                .version(0)
                .build());
        tasteDna.setMusicVectorJson(toJson(musicVector));
        tasteDna.setBookVectorJson(toJson(bookVector));
        tasteDna.setMusicConfidence(musicConfidence);
        tasteDna.setBookConfidence(bookConfidence);
        tasteDna.setWMusic(weights.music());
        tasteDna.setWBook(weights.book());
        tasteDna.setVersion(nextVersion(tasteDna.getVersion()));
        tasteDna.setCalculatedAt(now);
        userTasteDnaRepository.save(tasteDna);

        UserOnboarding onboarding = userOnboardingRepository.findById(user.getId()).orElseGet(() -> UserOnboarding.builder()
                .user(user)
                .build());
        onboarding.setMusicConnected(false);
        onboarding.setMusicDnaReady(true);
        onboarding.setBookDnaReady(true);
        onboarding.setTasteDnaReady(true);
        onboarding.setCompletedAt(onboarding.getCompletedAt() == null ? now : onboarding.getCompletedAt());
        userOnboardingRepository.save(onboarding);

        rabbitMQProducer.publishTasteUpdated(user.getId());

        return buildTasteProfileResponse(user);
    }

//    @Transactional(readOnly = true)
//    public MatchUserResponse getMatchWithUser(String email, Long otherUserId) {
//        User currentUser = findUserByEmail(email);
//        User otherUser = userRepository.findById(otherUserId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
//        return calculateMatch(currentUser, otherUser).orElse(null);
//    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public MatchUserResponse getMatchWithUser(String email, Long otherUserId) {

        User currentUser = findUserByEmail(email);

        User otherUser = userRepository.findById(otherUserId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        String cacheKey = "taste:match:"
                + currentUser.getId()
                + ":"
                + otherUserId;

        // Check Redis
        Object cached = redisTemplate.opsForValue().get(cacheKey);

        if (cached != null) {
            return (MatchUserResponse) cached;
        }

        // Redis miss
        MatchUserResponse result = calculateMatch(currentUser, otherUser)
                .orElse(null);

        if (result != null)
        {
            redisTemplate.opsForValue().set(
                    cacheKey,
                    result,
                    15,
                    TimeUnit.MINUTES
            );
        }

        return result;
    }

//    @Transactional(readOnly = true)
//    public List<MatchUserResponse> getRecommendedMatches(String email, Integer limit) {
//        User currentUser = findUserByEmail(email);
//        int normalizedLimit = Math.max(1, Math.min(limit == null ? DEFAULT_MATCH_LIMIT : limit, MAX_MATCH_LIMIT));
//
//        return userRepository.findAll().stream()
//                .filter(candidate -> !candidate.getId().equals(currentUser.getId()))
//                .map(candidate -> calculateMatch(currentUser, candidate))
//                .flatMap(Optional::stream)
//                .sorted(Comparator.comparingDouble(MatchUserResponse::getFinalMatch).reversed())
//                .limit(normalizedLimit)
//                .collect(Collectors.toList());
//    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<MatchUserResponse> getRecommendedMatches(String email, Integer limit) {
        // 1. Current User (1 query)
        User currentUser = findUserByEmail(email);
        int normalizedLimit = Math.max(1, Math.min(limit == null ? DEFAULT_MATCH_LIMIT : limit, MAX_MATCH_LIMIT));

        String cacheKey = "taste:matches:" + currentUser.getId();

        // Check Redis
        Object cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            List<MatchUserResponse> cachedMatches = (List<MatchUserResponse>) cached;
            return cachedMatches.stream()
                    .limit(normalizedLimit)
                    .collect(Collectors.toList());
        }

        // 2. Current User Taste DNA (1 query)
        UserTasteDna currentTaste = userTasteDnaRepository.findById(currentUser.getId()).orElse(null);
        if (currentTaste == null) {
            return Collections.emptyList();
        }

        // 3. Lấy ~50 candidate IDs + TasteDNA (1 query)
        List<UserTasteDna> candidateTastes = userTasteDnaRepository.findCandidatesForMatching(
                currentUser.getId(),
                PageRequest.of(0, 50)
        );
        if (candidateTastes.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> candidateIds = candidateTastes.stream().map(UserTasteDna::getUserId).toList();

        // 4. Batch query Profiles + Users (2 queries)
        Map<Long, User> userMap = userRepository.findAllById(candidateIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity(), (a, b) -> a));

        Map<Long, UserProfile> profileMap = userProfileRepository.findAllById(candidateIds).stream()
                .collect(Collectors.toMap(UserProfile::getUserId, Function.identity(), (a, b) -> a));

        // 5. Friendships WHERE (user_id = :currentUserId AND friend_id IN (...)) (1 query)
        Set<Long> friendIds = friendshipRepository.findFriendIdsIn(currentUser.getId(), candidateIds);

        // 6. FriendRequests WHERE candidate IN (...) (1 query)
        List<FriendRequest> requests = friendRequestRepository.findActiveRequestsIn(
                currentUser.getId(),
                candidateIds,
                com.soundbook.entity.enums.FriendRequestStatus.PENDING
        );
        Set<Long> pendingUserIds = new HashSet<>();
        for (FriendRequest req : requests) {
            if (req.getRequester().getId().equals(currentUser.getId())) {
                pendingUserIds.add(req.getReceiver().getId());
            } else {
                pendingUserIds.add(req.getRequester().getId());
            }
        }

        // 7. RAM Processing
        // ├── parse vector
        // ├── cosine similarity
        // ├── weighted music/book score
        // ├── filter (loại bỏ bạn bè & lời mời đang chờ)
        // ├── sort
        // └── top limit
        Map<String, Double> currentMusic = readMap(currentTaste.getMusicVectorJson());
        Map<String, Double> currentBook = readMap(currentTaste.getBookVectorJson());
        double wMusic = currentTaste.getWMusic() == null ? 0.5 : currentTaste.getWMusic().doubleValue();
        double wBook = currentTaste.getWBook() == null ? 0.5 : currentTaste.getWBook().doubleValue();
        double cMusic = currentTaste.getMusicConfidence() == null ? 0.5 : currentTaste.getMusicConfidence().doubleValue();
        double cBook = currentTaste.getBookConfidence() == null ? 0.5 : currentTaste.getBookConfidence().doubleValue();
        double denominator = (wMusic * cMusic) + (wBook * cBook);

        List<MatchUserResponse> matches = candidateTastes.stream()
                .filter(otherTaste -> !friendIds.contains(otherTaste.getUserId()) && !pendingUserIds.contains(otherTaste.getUserId()))
                .map(otherTaste -> {
                    Long otherId = otherTaste.getUserId();
                    User otherUser = userMap.get(otherId);
                    if (otherUser == null) return null;

                    Map<String, Double> otherMusic = readMap(otherTaste.getMusicVectorJson());
                    Map<String, Double> otherBook = readMap(otherTaste.getBookVectorJson());

                    double simMusic = cosineSimilarity(currentMusic, otherMusic);
                    double simBook = cosineSimilarity(currentBook, otherBook);
                    double baseMatch = denominator == 0 ? 0 : 100 * (((wMusic * cMusic * simMusic) + (wBook * cBook * simBook)) / denominator);
                    double finalMatch = Math.max(0, Math.min(100, baseMatch));

                    UserProfile profile = profileMap.get(otherId);

                    return MatchUserResponse.builder()
                            .userId(otherId)
                            .displayName(otherUser.getDisplayName())
                            .username(profile != null ? profile.getUsername() : null)
                            .avatarUrl(profile != null ? profile.getAvatarUrl() : null)
                            .musicSimilarity(round2(simMusic * 100))
                            .bookSimilarity(round2(simBook * 100))
                            .baseMatch(round2(baseMatch))
                            .conflictPenalty(0.0)
                            .finalMatch(round2(finalMatch))
                            .sharedFeatures(sharedFeatures(currentMusic, otherMusic, currentBook, otherBook))
                            .build();
                })
                .filter(Objects::nonNull)
                .sorted(Comparator.comparingDouble(MatchUserResponse::getFinalMatch).reversed())
                .limit(MAX_MATCH_LIMIT)
                .collect(Collectors.toList());

        // Save to redis (10 mins)
        redisTemplate.opsForValue().set(
                cacheKey,
                matches,
                10,
                TimeUnit.MINUTES
        );

        return matches.stream()
                .limit(normalizedLimit)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<DiscoverItemResponse> getDiscoverSeed(String email) {
        User user = findUserByEmail(email);
        UserTasteDna tasteDna = userTasteDnaRepository.findById(user.getId()).orElse(null);
        if (tasteDna == null) {
            return Collections.emptyList();
        }

        Map<String, Double> musicVector = readMap(tasteDna.getMusicVectorJson());
        Map<String, Double> bookVector = readMap(tasteDna.getBookVectorJson());

        List<Post> candidatePosts = postRepository.findByVisibilityOrderByCreatedAtDesc(Visibility.PUBLIC, PageRequest.of(0, 50)).stream()
                .filter(post -> !post.getUser().getId().equals(user.getId()))
                .toList();

        if (candidatePosts.isEmpty()) {
            return Collections.emptyList();
        }

        List<Long> postIds = candidatePosts.stream().map(Post::getId).toList();

        // Batch comment count (1 query)
        Map<Long, Long> commentCountMap = commentRepository.countCommentsByPostIds(postIds, com.soundbook.entity.enums.CommentStatus.DELETED).stream()
                .collect(Collectors.toMap(com.soundbook.dto.feed.CommentCountProjection::getPostId, com.soundbook.dto.feed.CommentCountProjection::getTotal, (a, b) -> a));

        // Batch reaction summary (1 query)
        List<com.soundbook.dto.feed.ReactionSummaryProjection> reactionRows = reactionRepository.findReactionSummary(TargetType.POST, postIds);
        Map<Long, Long> totalReactionsMap = new HashMap<>();
        for (com.soundbook.dto.feed.ReactionSummaryProjection row : reactionRows) {
            totalReactionsMap.merge(row.getTargetId(), row.getTotal(), Long::sum);
        }

        return candidatePosts.stream()
                .map(post -> {
                    long totalReactions = totalReactionsMap.getOrDefault(post.getId(), 0L);
                    long totalComments = commentCountMap.getOrDefault(post.getId(), 0L);
                    return buildDiscoverItemFromPost(post, musicVector, bookVector, totalReactions, totalComments);
                })
                .sorted(Comparator.comparingDouble(DiscoverItemResponse::getScore).reversed())
                .limit(12)
                .collect(Collectors.toList());
    }

    private DiscoverItemResponse buildDiscoverItemFromPost(Post post,
                                                           Map<String, Double> musicVector,
                                                           Map<String, Double> bookVector,
                                                           long totalReactions,
                                                           long totalComments) {
        boolean musicPost = post.getType() == PostType.MUSIC_QUICK_NOTE;
        boolean bookPost = post.getType() == PostType.BOOK_REVIEW
                || post.getType() == PostType.BOOK_QUOTE_CARD
                || post.getType() == PostType.BOOK_READING_UPDATE;
        String searchable = slug(String.join(" ",
                post.getCaption() == null ? "" : post.getCaption(),
                post.getContentRich() == null ? "" : post.getContentRich(),
                post.getMoodTag() == null ? "" : post.getMoodTag(),
                post.getRefJson() == null ? "" : post.getRefJson(),
                post.getType() == null ? "" : post.getType().name()
        ));
        double score = 0;
        if (musicPost && !musicVector.isEmpty()) {
            score += 18;
        }
        if (bookPost && !bookVector.isEmpty()) {
            score += 18;
        }
        score += discoverVectorOverlap(searchable, musicVector, 36);
        score += discoverVectorOverlap(searchable, bookVector, 42);
        score += Math.min(20, (totalReactions + totalComments) * 2.5);

        return DiscoverItemResponse.builder()
                .type(musicPost ? "MUSIC" : "BOOK")
                .title(firstNonBlank(extractJsonText(post.getRefJson(), "title", "name", "bookTitle", "trackTitle"), truncate(post.getCaption(), 70), "Bài viết #" + post.getId()))
                .subtitle(post.getUser().getDisplayName())
                .reason(buildDiscoverReason(post, score))
                .score(round2(Math.min(100, score)))
                .build();
    }

    private double discoverVectorOverlap(String searchable, Map<String, Double> vector, double maxContribution) {
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

    private String buildDiscoverReason(Post post, double score) {
        if (score >= 40) {
            return "Nội dung này hợp gu với bạn.";
        }
        if (post.getType() == PostType.MUSIC_QUICK_NOTE) {
            return "Nội dung âm nhạc từ cộng đồng Soundbook.";
        }
        return "Nội dung sách/truyện từ cộng đồng Soundbook.";
    }

    private String extractJsonText(String json, String... keys) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            Map<String, Object> payload = objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
            for (String key : keys) {
                Object value = payload.get(key);
                if (value != null && !String.valueOf(value).isBlank()) {
                    return String.valueOf(value);
                }
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
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

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength - 1) + "…";
    }

    public Map<String, Double> parseVector(String json) {
        return readMap(json);
    }

    public Double calculateSimilarityScore(
            Map<String, Double> viewerMusic,
            Map<String, Double> viewerBook,
            double wMusic,
            double wBook,
            double cMusic,
            double cBook,
            UserTasteDna friendTaste
    ) {
        if (friendTaste == null || (viewerMusic.isEmpty() && viewerBook.isEmpty())) {
            return 0.0;
        }
        Map<String, Double> friendMusic = readMap(friendTaste.getMusicVectorJson());
        Map<String, Double> friendBook = readMap(friendTaste.getBookVectorJson());

        double simMusic = cosineSimilarity(viewerMusic, friendMusic);
        double simBook = cosineSimilarity(viewerBook, friendBook);
        double denominator = (wMusic * cMusic) + (wBook * cBook);
        if (denominator == 0) return 0.0;
        double baseMatch = 100 * (((wMusic * cMusic * simMusic) + (wBook * cBook * simBook)) / denominator);
        return round2(Math.max(0, Math.min(100, baseMatch)));
    }

    public List<String> getSharedFeatures(
            Map<String, Double> viewerMusic,
            Map<String, Double> viewerBook,
            UserTasteDna friendTaste
    ) {
        if (friendTaste == null || (viewerMusic.isEmpty() && viewerBook.isEmpty())) {
            return Collections.emptyList();
        }
        Map<String, Double> otherMusic = readMap(friendTaste.getMusicVectorJson());
        Map<String, Double> otherBook = readMap(friendTaste.getBookVectorJson());
        return sharedFeatures(viewerMusic, otherMusic, viewerBook, otherBook);
    }

    public Double calculateSimilarityScore(UserTasteDna viewerTaste, UserTasteDna friendTaste) {
        if (viewerTaste == null || friendTaste == null) {
            return 0.0;
        }
        Map<String, Double> viewerMusic = readMap(viewerTaste.getMusicVectorJson());
        Map<String, Double> friendMusic = readMap(friendTaste.getMusicVectorJson());
        Map<String, Double> viewerBook = readMap(viewerTaste.getBookVectorJson());
        Map<String, Double> friendBook = readMap(friendTaste.getBookVectorJson());

        double simMusic = cosineSimilarity(viewerMusic, friendMusic);
        double simBook = cosineSimilarity(viewerBook, friendBook);
        double wMusic = viewerTaste.getWMusic() == null ? 0.5 : viewerTaste.getWMusic().doubleValue();
        double wBook = viewerTaste.getWBook() == null ? 0.5 : viewerTaste.getWBook().doubleValue();
        double cMusic = viewerTaste.getMusicConfidence() == null ? 0.5 : viewerTaste.getMusicConfidence().doubleValue();
        double cBook = viewerTaste.getBookConfidence() == null ? 0.5 : viewerTaste.getBookConfidence().doubleValue();
        double denominator = (wMusic * cMusic) + (wBook * cBook);
        if (denominator == 0) return 0.0;
        double baseMatch = 100 * (((wMusic * cMusic * simMusic) + (wBook * cBook * simBook)) / denominator);
        return round2(Math.max(0, Math.min(100, baseMatch)));
    }

    public List<String> getSharedFeatures(UserTasteDna viewerTaste, UserTasteDna friendTaste) {
        if (viewerTaste == null || friendTaste == null) {
            return Collections.emptyList();
        }
        Map<String, Double> currentMusic = readMap(viewerTaste.getMusicVectorJson());
        Map<String, Double> otherMusic = readMap(friendTaste.getMusicVectorJson());
        Map<String, Double> currentBook = readMap(viewerTaste.getBookVectorJson());
        Map<String, Double> otherBook = readMap(friendTaste.getBookVectorJson());
        return sharedFeatures(currentMusic, otherMusic, currentBook, otherBook);
    }

    private Optional<MatchUserResponse> calculateMatch(User currentUser, User otherUser) {
        UserTasteDna currentTaste = userTasteDnaRepository.findById(currentUser.getId()).orElse(null);
        UserTasteDna otherTaste = userTasteDnaRepository.findById(otherUser.getId()).orElse(null);
        if (currentTaste == null || otherTaste == null) {
            return Optional.empty();
        }

        Map<String, Double> currentMusic = readMap(currentTaste.getMusicVectorJson());
        Map<String, Double> currentBook = readMap(currentTaste.getBookVectorJson());
        Map<String, Double> otherMusic = readMap(otherTaste.getMusicVectorJson());
        Map<String, Double> otherBook = readMap(otherTaste.getBookVectorJson());

        double simMusic = cosineSimilarity(currentMusic, otherMusic);
        double simBook = cosineSimilarity(currentBook, otherBook);
        double wMusic = currentTaste.getWMusic().doubleValue();
        double wBook = currentTaste.getWBook().doubleValue();
        double cMusic = currentTaste.getMusicConfidence().doubleValue();
        double cBook = currentTaste.getBookConfidence().doubleValue();
        double denominator = (wMusic * cMusic) + (wBook * cBook);
        double baseMatch = denominator == 0 ? 0 : 100 * (((wMusic * cMusic * simMusic) + (wBook * cBook * simBook)) / denominator);
        double conflictPenalty = calculateConflictPenalty(currentUser, otherUser, otherMusic, otherBook, currentMusic, currentBook);
        double finalMatch = Math.max(0, Math.min(100, baseMatch - conflictPenalty));

        UserProfile profile = userProfileRepository.findById(otherUser.getId()).orElse(null);

        return Optional.of(MatchUserResponse.builder()
                .userId(otherUser.getId())
                .displayName(otherUser.getDisplayName())
                .username(profile != null ? profile.getUsername() : null)
                .avatarUrl(profile != null ? profile.getAvatarUrl() : null)
                .musicSimilarity(round2(simMusic * 100))
                .bookSimilarity(round2(simBook * 100))
                .baseMatch(round2(baseMatch))
                .conflictPenalty(round2(conflictPenalty))
                .finalMatch(round2(finalMatch))
                .sharedFeatures(sharedFeatures(currentMusic, otherMusic, currentBook, otherBook))
                .build());
    }

    private double calculateConflictPenalty(User currentUser, User otherUser,
                                            Map<String, Double> otherMusic,
                                            Map<String, Double> otherBook,
                                            Map<String, Double> currentMusic,
                                            Map<String, Double> currentBook) {
        PreferenceSnapshot currentMusicPrefs = readMusicPrefs(currentUser.getId());
        PreferenceSnapshot currentBookPrefs = readBookPrefs(currentUser.getId());
        PreferenceSnapshot otherMusicPrefs = readMusicPrefs(otherUser.getId());
        PreferenceSnapshot otherBookPrefs = readBookPrefs(otherUser.getId());

        double penalty = 0;
        penalty += conflictByDislikedGenres(currentMusicPrefs.getDislikedGenres(), otherMusic, "genre:", 5.0);
        penalty += conflictByDislikedGenres(otherMusicPrefs.getDislikedGenres(), currentMusic, "genre:", 5.0);
        penalty += conflictByDislikedGenres(currentBookPrefs.getDislikedGenres(), otherBook, "genre:", 5.0);
        penalty += conflictByDislikedGenres(otherBookPrefs.getDislikedGenres(), currentBook, "genre:", 5.0);
        return Math.min(20, penalty);
    }

    private double conflictByDislikedGenres(List<String> dislikedGenres, Map<String, Double> otherVector, String prefix, double perConflict) {
        if (dislikedGenres == null || dislikedGenres.isEmpty()) {
            return 0;
        }
        double penalty = 0;
        for (String genre : dislikedGenres) {
            String key = prefix + slug(genre);
            if (otherVector.getOrDefault(key, 0.0) > 0.05) {
                penalty += perConflict;
            }
        }
        return penalty;
    }

    private List<String> sharedFeatures(Map<String, Double> currentMusic,
                                        Map<String, Double> otherMusic,
                                        Map<String, Double> currentBook,
                                        Map<String, Double> otherBook) {
        Map<String, Double> shared = new LinkedHashMap<>();
        collectShared(shared, currentMusic, otherMusic);
        collectShared(shared, currentBook, otherBook);
        return shared.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(6)
                .map(entry -> humanizeFeature(entry.getKey()))
                .collect(Collectors.toList());
    }

    private void collectShared(Map<String, Double> shared, Map<String, Double> left, Map<String, Double> right) {
        for (Map.Entry<String, Double> entry : left.entrySet()) {
            double rightValue = right.getOrDefault(entry.getKey(), 0.0);
            if (entry.getValue() > 0 && rightValue > 0) {
                shared.put(entry.getKey(), Math.min(entry.getValue(), rightValue));
            }
        }
    }

    private TasteProfileResponse buildTasteProfileResponse(User user) {
        UserOnboarding onboarding = userOnboardingRepository.findById(user.getId()).orElse(null);
        UserMusicDna musicDna = userMusicDnaRepository.findById(user.getId()).orElse(null);
        UserBookDna bookDna = userBookDnaRepository.findById(user.getId()).orElse(null);
        UserTasteDna tasteDna = userTasteDnaRepository.findById(user.getId()).orElse(null);
        PreferenceSnapshot musicPrefs = musicDna == null ? PreferenceSnapshot.empty() : fromJson(musicDna.getPrefsJson(), PreferenceSnapshot.class, PreferenceSnapshot.empty());
        PreferenceSnapshot bookPrefs = bookDna == null ? PreferenceSnapshot.empty() : fromJson(bookDna.getPrefsJson(), PreferenceSnapshot.class, PreferenceSnapshot.empty());

        return TasteProfileResponse.builder()
                .userId(user.getId())
                .completed(onboarding != null && Boolean.TRUE.equals(onboarding.getTasteDnaReady()))
                .musicGenres(musicPrefs.getGenres())
                .musicMoods(musicPrefs.getMoods())
                .musicArtists(musicPrefs.getArtists())
                .musicSongs(musicPrefs.getSongs())
                .musicDislikedGenres(musicPrefs.getDislikedGenres())
                .bookGenres(bookPrefs.getGenres())
                .bookThemes(bookPrefs.getThemes())
                .bookAuthors(bookPrefs.getAuthors())
                .favoriteBooks(bookPrefs.getBooks())
                .bookDislikedGenres(bookPrefs.getDislikedGenres())
                .musicVector(tasteDna == null ? Collections.emptyMap() : readMap(tasteDna.getMusicVectorJson()))
                .bookVector(tasteDna == null ? Collections.emptyMap() : readMap(tasteDna.getBookVectorJson()))
                .musicConfidence(tasteDna == null ? BigDecimal.ZERO : tasteDna.getMusicConfidence())
                .bookConfidence(tasteDna == null ? BigDecimal.ZERO : tasteDna.getBookConfidence())
                .weightMusic(tasteDna == null ? new BigDecimal("0.50") : tasteDna.getWMusic())
                .weightBook(tasteDna == null ? new BigDecimal("0.50") : tasteDna.getWBook())
                .version(tasteDna == null ? 0 : tasteDna.getVersion())
                .updatedAt(tasteDna == null ? null : tasteDna.getCalculatedAt())
                .build();
    }

    private PreferenceSnapshot readMusicPrefs(Long userId) {
        return userMusicDnaRepository.findById(userId)
                .map(UserMusicDna::getPrefsJson)
                .map(json -> fromJson(json, PreferenceSnapshot.class, PreferenceSnapshot.empty()))
                .orElse(PreferenceSnapshot.empty());
    }

    private PreferenceSnapshot readBookPrefs(Long userId) {
        return userBookDnaRepository.findById(userId)
                .map(UserBookDna::getPrefsJson)
                .map(json -> fromJson(json, PreferenceSnapshot.class, PreferenceSnapshot.empty()))
                .orElse(PreferenceSnapshot.empty());
    }

    private void validatePreferenceRequest(PreferenceRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        if (clean(request.getMusicGenres()).size() < 3) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        if (clean(request.getBookGenres()).size() < 3) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }

    private Map<String, Double> buildMusicVector(PreferenceSnapshot prefs) {
        Map<String, Double> vector = new LinkedHashMap<>();
        addGroup(vector, "genre", prefs.getGenres(), 0.50);
        addGroup(vector, "mood", prefs.getMoods(), 0.20);
        addGroup(vector, "artist", prefs.getArtists(), 0.20);
        addGroup(vector, "song", prefs.getSongs(), 0.10);
        return normalizeVector(vector);
    }

    private Map<String, Double> buildBookVector(PreferenceSnapshot prefs) {
        Map<String, Double> vector = new LinkedHashMap<>();
        addGroup(vector, "genre", prefs.getGenres(), 0.50);
        addGroup(vector, "theme", prefs.getThemes(), 0.20);
        addGroup(vector, "author", prefs.getAuthors(), 0.15);
        addGroup(vector, "book", prefs.getBooks(), 0.15);
        return normalizeVector(vector);
    }

    private void addGroup(Map<String, Double> vector, String prefix, List<String> values, double groupWeight) {
        List<String> cleaned = clean(values);
        if (cleaned.isEmpty()) {
            return;
        }
        double perItem = groupWeight / cleaned.size();
        for (String value : cleaned) {
            String key = prefix + ":" + slug(value);
            vector.merge(key, perItem, Double::sum);
        }
    }

    private Map<String, Double> normalizeVector(Map<String, Double> vector) {
        double sum = vector.values().stream().mapToDouble(Double::doubleValue).sum();
        if (sum <= 0) {
            return Collections.emptyMap();
        }
        Map<String, Double> normalized = new LinkedHashMap<>();
        for (Map.Entry<String, Double> entry : vector.entrySet()) {
            normalized.put(entry.getKey(), round4(entry.getValue() / sum));
        }
        return normalized;
    }

    private BigDecimal confidenceForMusic(PreferenceSnapshot prefs) {
        double score = 0.55;
        score += Math.min(0.12, Math.max(0, prefs.getGenres().size() - 3) * 0.03);
        score += Math.min(0.12, prefs.getMoods().size() * 0.03);
        score += Math.min(0.12, prefs.getArtists().size() * 0.025);
        score += Math.min(0.09, prefs.getSongs().size() * 0.015);
        return toConfidence(score);
    }

    private BigDecimal confidenceForBook(PreferenceSnapshot prefs) {
        double score = 0.55;
        score += Math.min(0.12, Math.max(0, prefs.getGenres().size() - 3) * 0.03);
        score += Math.min(0.12, prefs.getThemes().size() * 0.03);
        score += Math.min(0.12, prefs.getAuthors().size() * 0.025);
        score += Math.min(0.09, prefs.getBooks().size() * 0.02);
        return toConfidence(score);
    }

    private BigDecimal toConfidence(double value) {
        return BigDecimal.valueOf(Math.min(1.0, Math.max(0.55, value))).setScale(2, RoundingMode.HALF_UP);
    }

    private WeightPair normalizeWeights(BigDecimal requestedMusic, BigDecimal requestedBook) {
        BigDecimal music = requestedMusic == null ? new BigDecimal("0.50") : requestedMusic;
        BigDecimal book = requestedBook == null ? new BigDecimal("0.50") : requestedBook;
        if (music.compareTo(BigDecimal.ZERO) < 0 || book.compareTo(BigDecimal.ZERO) < 0 || music.add(book).compareTo(BigDecimal.ZERO) == 0) {
            return new WeightPair(new BigDecimal("0.50"), new BigDecimal("0.50"));
        }
        BigDecimal total = music.add(book);
        return new WeightPair(
                music.divide(total, 2, RoundingMode.HALF_UP),
                book.divide(total, 2, RoundingMode.HALF_UP)
        );
    }

    private double cosineSimilarity(Map<String, Double> left, Map<String, Double> right) {
        if (left == null || right == null || left.isEmpty() || right.isEmpty()) {
            return 0;
        }
        Set<String> keys = new HashSet<>();
        keys.addAll(left.keySet());
        keys.addAll(right.keySet());
        double dot = 0;
        double leftNorm = 0;
        double rightNorm = 0;
        for (String key : keys) {
            double l = left.getOrDefault(key, 0.0);
            double r = right.getOrDefault(key, 0.0);
            dot += l * r;
            leftNorm += l * l;
            rightNorm += r * r;
        }
        if (leftNorm == 0 || rightNorm == 0) {
            return 0;
        }
        return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
    }

    private List<Map.Entry<String, Double>> topEntries(Map<String, Double> vector, int limit) {
        return vector.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .limit(limit)
                .collect(Collectors.toList());
    }

    private User findUserByEmail(String email) {
        return userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private List<String> clean(List<String> values) {
        if (values == null) {
            return Collections.emptyList();
        }
        return values.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .distinct()
                .collect(Collectors.toList());
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

    private String humanizeFeature(String feature) {
        if (feature == null || feature.isBlank()) {
            return "";
        }
        int index = feature.indexOf(':');
        String value = index >= 0 ? feature.substring(index + 1) : feature;
        return Arrays.stream(value.split("_"))
                .filter(part -> !part.isBlank())
                .map(part -> part.substring(0, 1).toUpperCase(Locale.ROOT) + part.substring(1))
                .collect(Collectors.joining(" "));
    }

    private int nextVersion(Integer currentVersion) {
        return currentVersion == null ? 1 : currentVersion + 1;
    }

    private double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private double round4(double value) {
        return BigDecimal.valueOf(value).setScale(4, RoundingMode.HALF_UP).doubleValue();
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot serialize Taste DNA JSON", exception);
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

    private <T> T fromJson(String json, Class<T> type, T fallback) {
        if (json == null || json.isBlank()) {
            return fallback;
        }
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception exception) {
            return fallback;
        }
    }

    private record WeightPair(BigDecimal music, BigDecimal book) {}

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class PreferenceSnapshot {
        @lombok.Builder.Default
        private List<String> genres = Collections.emptyList();
        @lombok.Builder.Default
        private List<String> moods = Collections.emptyList();
        @lombok.Builder.Default
        private List<String> themes = Collections.emptyList();
        @lombok.Builder.Default
        private List<String> artists = Collections.emptyList();
        @lombok.Builder.Default
        private List<String> songs = Collections.emptyList();
        @lombok.Builder.Default
        private List<String> authors = Collections.emptyList();
        @lombok.Builder.Default
        private List<String> books = Collections.emptyList();
        @lombok.Builder.Default
        private List<String> dislikedGenres = Collections.emptyList();

        public static PreferenceSnapshot empty() {
            return PreferenceSnapshot.builder().build();
        }
    }
}
