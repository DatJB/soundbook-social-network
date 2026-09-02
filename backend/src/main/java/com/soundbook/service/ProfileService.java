package com.soundbook.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.feed.FeedPostResponse;
import com.soundbook.dto.profile.ProfileResponse;
import com.soundbook.dto.profile.ProfileShelfItemResponse;
import com.soundbook.dto.profile.ProfileShelfResponse;
import com.soundbook.dto.profile.ProfileStatsResponse;
import com.soundbook.dto.social.FriendUserResponse;
import com.soundbook.dto.taste.MatchUserResponse;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.FriendRequestStatus;
import com.soundbook.entity.enums.Visibility;
import com.soundbook.repository.*;
import com.soundbook.service.admin.FileUploadService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final UserTasteDnaRepository userTasteDnaRepository;
    private final FriendshipRepository friendshipRepository;
    private final FriendRequestRepository friendRequestRepository;
    private final FollowRepository followRepository;
    private final PostRepository postRepository;
    private final UserMusicCollectionRepository musicCollectionRepository;
    private final UserBookshelfItemRepository bookshelfItemRepository;
    private final TasteDnaService tasteDnaService;
    private final FriendService friendService;
    private final FeedService feedService;
    private final FileUploadService cloudinaryService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Transactional(readOnly = true)
    public ProfileResponse getProfile(String requesterEmail, String rawUserId) {
        User requester = userRepository.findByEmail(requesterEmail).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        User profileUser = resolveProfileUser(requester, rawUserId);
        UserProfile profile = userProfileRepository.findById(profileUser.getId()).orElse(null);
        boolean ownProfile = Objects.equals(requester.getId(), profileUser.getId());
        boolean isFollowing = !ownProfile && followRepository.existsByIdFollowerIdAndIdFolloweeId(requester.getId(), profileUser.getId());

        // Taste DNA Match between viewer and profile owner (0 query nếu dùng calculateSimilarityScore)
        UserTasteDna viewerTaste = userTasteDnaRepository.findById(requester.getId()).orElse(null);
        UserTasteDna profileTaste = ownProfile ? viewerTaste : userTasteDnaRepository.findById(profileUser.getId()).orElse(null);

        double matchScore = 0.0;
        List<String> sharedFeatures = Collections.emptyList();
        if (!ownProfile && viewerTaste != null && profileTaste != null) {
            matchScore = tasteDnaService.calculateSimilarityScore(viewerTaste, profileTaste);
            sharedFeatures = tasteDnaService.getSharedFeatures(viewerTaste, profileTaste);
        }

        // Direct relationship check (1-2 queries thay vì gọi lặp friendService)
        String friendshipStatus = "NONE";
        Long friendRequestId = null;
        boolean canMessage = false;

        if (ownProfile) {
            friendshipStatus = "SELF";
        } else {
            Set<Long> isFriendSet = friendshipRepository.findFriendIdsIn(requester.getId(), List.of(profileUser.getId()));
            if (isFriendSet.contains(profileUser.getId())) {
                friendshipStatus = "FRIENDS";
                canMessage = true;
            } else {
                List<FriendRequest> directRequests = friendRequestRepository.findActiveRequestsIn(
                        requester.getId(),
                        List.of(profileUser.getId()),
                        FriendRequestStatus.PENDING
                );
                if (!directRequests.isEmpty()) {
                    FriendRequest req = directRequests.get(0);
                    if (req.getRequester().getId().equals(requester.getId())) {
                        friendshipStatus = "OUTGOING_REQUEST";
                    } else {
                        friendshipStatus = "INCOMING_REQUEST";
                    }
                    friendRequestId = req.getId();
                }
            }
        }

        // Friends preview (được tối ưu batching 5-6 queries cho 9 bạn bè)
        List<FriendUserResponse> friendsPreview = buildFriendsPreview(requester, profileUser);

        // 10 posts ban đầu (đã tối ưu batching)
        List<FeedPostResponse> posts = feedService.getProfilePosts(requester.getEmail(), profileUser.getId(), 10);

        return ProfileResponse.builder()
                .userId(profileUser.getId())
                .displayName(profileUser.getDisplayName())
                .email(ownProfile ? profileUser.getEmail() : null)
                .username(profile == null ? null : profile.getUsername())
                .avatarUrl(profile == null ? null : profile.getAvatarUrl())
                .coverUrl(profile == null ? null : profile.getCoverUrl())
                .bio(profile == null || !canView(profile.getBioVisibility(), requester, profileUser) ? null : profile.getBio())
                .publicInfo(profile == null || !canView(profile.getPublicInfoVisibility(), requester, profileUser) ? null : profile.getPublicInfo())
                .bioVisibility(visibilityName(profile == null ? null : profile.getBioVisibility()))
                .publicInfoVisibility(visibilityName(profile == null ? null : profile.getPublicInfoVisibility()))
                .pinnedTrackId(profile == null || !canView(profile.getPinnedTrackVisibility(), requester, profileUser) ? null : profile.getPinnedTrackId())
                .pinnedTrackVisibility(visibilityName(profile == null ? null : profile.getPinnedTrackVisibility()))
                .allowPreviewPlayer(profile == null || Boolean.TRUE.equals(profile.getAllowPreviewPlayer()))
                .stats(ProfileStatsResponse.builder()
                        .posts(postRepository.countByUser_Id(profileUser.getId()))
                        .friends(friendshipRepository.countByIdUserId(profileUser.getId()))
                        .followers(followRepository.countByIdFolloweeId(profileUser.getId()))
                        .following(followRepository.countByIdFollowerId(profileUser.getId()))
                        .build())
                .matchScore(matchScore)
                .sharedFeatures(sharedFeatures)
                .friendshipStatus(friendshipStatus)
                .following(isFollowing)
                .friendRequestId(friendRequestId)
                .canMessage(canMessage)
                .friendsPreview(friendsPreview)
                .shelves(buildShelves(profileUser.getId(), requester, profileUser))
                .posts(posts)
                .updatedAt(profile == null ? profileUser.getUpdatedAt() : profile.getUpdatedAt())
                .build();
    }

    @Transactional(readOnly = true)
    public List<FriendUserResponse> getFollowers(String requesterEmail, String rawUserId) {
        User requester = userRepository.findByEmail(requesterEmail).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        User targetUser = resolveProfileUser(requester, rawUserId);

        List<Follow> follows = followRepository.findByIdFolloweeId(targetUser.getId());
        List<Long> followerIds = follows.stream().map(f -> f.getId().getFollowerId()).toList();
        List<User> followers = userRepository.findAllById(followerIds);

        return batchBuildFriendUsers(requester, followers, null);
    }

    @Transactional(readOnly = true)
    public List<FriendUserResponse> searchFollowers(String requesterEmail, String rawUserId, String query) {
        User requester = userRepository.findByEmail(requesterEmail).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        User targetUser = resolveProfileUser(requester, rawUserId);

        List<Follow> follows = followRepository.searchFollowers(targetUser.getId(), query);
        List<Long> followerIds = follows.stream().map(f -> f.getId().getFollowerId()).toList();
        List<User> followers = userRepository.findAllById(followerIds);

        return batchBuildFriendUsers(requester, followers, null);
    }

    @Transactional(readOnly = true)
    public List<FriendUserResponse> getFriends(String requesterEmail, String rawUserId) {
        User requester = userRepository.findByEmail(requesterEmail).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        User targetUser = resolveProfileUser(requester, rawUserId);

        List<Friendship> friendships = friendshipRepository.findByIdUserIdOrderByCreatedAtDesc(targetUser.getId());
        List<User> friends = friendships.stream().map(Friendship::getFriend).toList();
        Map<Long, LocalDateTime> connectedAtMap = friendships.stream()
                .collect(Collectors.toMap(f -> f.getFriend().getId(), Friendship::getCreatedAt, (a, b) -> a));

        return batchBuildFriendUsers(requester, friends, connectedAtMap);
    }

    /**
     * Tối ưu hóa Friends Preview: 5-6 queries cho 9 friends, 0 query N+1 trong loop.
     */
    private List<FriendUserResponse> buildFriendsPreview(User requester, User profileUser) {
        // 1. Chỉ lấy đúng 9 records từ DB
        List<Friendship> friendships = friendshipRepository.findByIdUserIdOrderByCreatedAtDesc(
                profileUser.getId(),
                PageRequest.of(0, 9)
        );

        if (friendships.isEmpty()) {
            return Collections.emptyList();
        }

        List<User> friends = friendships.stream().map(Friendship::getFriend).toList();
        Map<Long, LocalDateTime> connectedAtMap = friendships.stream()
                .collect(Collectors.toMap(f -> f.getFriend().getId(), Friendship::getCreatedAt, (a, b) -> a));

        return batchBuildFriendUsers(requester, friends, connectedAtMap);
    }

    /**
     * Batch loading pure mapper: gom toàn bộ quan hệ bạn bè, profile, lời mời và taste DNA
     * trước khi mapping trong RAM.
     */
    private List<FriendUserResponse> batchBuildFriendUsers(User requester, List<User> targetUsers, Map<Long, LocalDateTime> connectedAtMap) {
        if (targetUsers == null || targetUsers.isEmpty()) {
            return Collections.emptyList();
        }

        Long viewerId = requester.getId();
        List<Long> targetIds = targetUsers.stream().map(User::getId).distinct().toList();

        // 1. Batch Profiles (1 query)
        Map<Long, UserProfile> profileMap = userProfileRepository.findAllById(targetIds).stream()
                .collect(Collectors.toMap(UserProfile::getUserId, Function.identity(), (a, b) -> a));

        // 2. Batch Friendship status (1 query)
        Set<Long> viewerFriendIds = friendshipRepository.findFriendIdsIn(viewerId, targetIds);

        // 3. Batch Friend Requests 2 chiều (1 query)
        List<FriendRequest> requests = friendRequestRepository.findActiveRequestsIn(
                viewerId,
                targetIds,
                FriendRequestStatus.PENDING
        );
        Map<Long, String> requestStatusMap = new HashMap<>();
        Map<Long, Long> requestIdMap = new HashMap<>();
        for (FriendRequest req : requests) {
            if (req.getRequester().getId().equals(viewerId)) {
                requestStatusMap.put(req.getReceiver().getId(), "OUTGOING_REQUEST");
                requestIdMap.put(req.getReceiver().getId(), req.getId());
            } else {
                requestStatusMap.put(req.getRequester().getId(), "INCOMING_REQUEST");
                requestIdMap.put(req.getRequester().getId(), req.getId());
            }
        }

        // 4. Viewer Taste DNA (1 query) & Pre-parse vector ONCE outside loop
        UserTasteDna viewerTaste = userTasteDnaRepository.findById(viewerId).orElse(null);
        Map<String, Double> viewerMusic = viewerTaste != null ? tasteDnaService.parseVector(viewerTaste.getMusicVectorJson()) : Collections.emptyMap();
        Map<String, Double> viewerBook = viewerTaste != null ? tasteDnaService.parseVector(viewerTaste.getBookVectorJson()) : Collections.emptyMap();
        double wMusic = (viewerTaste != null && viewerTaste.getWMusic() != null) ? viewerTaste.getWMusic().doubleValue() : 0.5;
        double wBook = (viewerTaste != null && viewerTaste.getWBook() != null) ? viewerTaste.getWBook().doubleValue() : 0.5;
        double cMusic = (viewerTaste != null && viewerTaste.getMusicConfidence() != null) ? viewerTaste.getMusicConfidence().doubleValue() : 0.5;
        double cBook = (viewerTaste != null && viewerTaste.getBookConfidence() != null) ? viewerTaste.getBookConfidence().doubleValue() : 0.5;

        // 5. Batch Target Users Taste DNA (1 query)
        Map<Long, UserTasteDna> targetTasteMap = userTasteDnaRepository.findAllById(targetIds).stream()
                .collect(Collectors.toMap(UserTasteDna::getUserId, Function.identity(), (a, b) -> a));

        // 6. Pure in-memory DTO construction (0 database queries)
        return targetUsers.stream().map(user -> {
            Long userId = user.getId();
            UserProfile profile = profileMap.get(userId);
            UserTasteDna targetTaste = targetTasteMap.get(userId);

            String status;
            Long requestId = null;
            if (Objects.equals(viewerId, userId)) {
                status = "SELF";
            } else if (viewerFriendIds.contains(userId)) {
                status = "FRIENDS";
            } else if (requestStatusMap.containsKey(userId)) {
                status = requestStatusMap.get(userId);
                requestId = requestIdMap.get(userId);
            } else {
                status = "NONE";
            }

            double matchScore = (viewerTaste != null && targetTaste != null)
                    ? tasteDnaService.calculateSimilarityScore(viewerMusic, viewerBook, wMusic, wBook, cMusic, cBook, targetTaste)
                    : 0.0;
            List<String> sharedFeatures = (viewerTaste != null && targetTaste != null)
                    ? tasteDnaService.getSharedFeatures(viewerMusic, viewerBook, targetTaste)
                    : Collections.emptyList();

            LocalDateTime connectedAt = connectedAtMap != null ? connectedAtMap.get(userId) : null;

            return FriendUserResponse.builder()
                    .userId(userId)
                    .displayName(user.getDisplayName())
                    .username(profile != null ? profile.getUsername() : null)
                    .avatarUrl(profile != null ? profile.getAvatarUrl() : null)
                    .bio(profile != null ? profile.getBio() : null)
                    .matchScore(matchScore)
                    .sharedFeatures(sharedFeatures)
                    .friendshipStatus(status)
                    .requestId(requestId)
                    .canMessage("FRIENDS".equals(status))
                    .connectedAt(connectedAt)
                    .build();
        }).toList();
    }

    private User resolveProfileUser(User requester, String rawUserId) {
        if (rawUserId == null || rawUserId.isBlank() || "me".equalsIgnoreCase(rawUserId)) {
            return requester;
        }
        try {
            Long userId = Long.parseLong(rawUserId);
            return userRepository.findById(userId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        } catch (NumberFormatException exception) {
            throw new AppException(ErrorCode.USER_NOT_FOUND);
        }
    }

    private List<ProfileShelfResponse> buildShelves(Long userId, User requester, User owner) {
        List<Visibility> visibleScopes = visibleScopes(requester, owner);
        List<ProfileShelfItemResponse> musicItems = musicCollectionRepository
                .findByUser_IdAndVisibilityInOrderBySortOrderAscCreatedAtDesc(userId, visibleScopes)
                .stream()
                .limit(12)
                .map(item -> ProfileShelfItemResponse.builder()
                        .id(item.getId())
                        .type("music")
                        .title(item.getTitle())
                        .author(item.getSubtitle())
                        .image(item.getCoverUrl())
                        .itemId(item.getItemId())
                        .previewUrl(item.getPreviewUrl())
                        .visibility(visibilityName(item.getVisibility()))
                        .build())
                .collect(Collectors.toList());

        List<ProfileShelfItemResponse> bookItems = bookshelfItemRepository.findByUser_IdAndVisibilityInOrderByUpdatedAtDesc(userId, visibleScopes).stream()
                .limit(12)
                .map(item -> {
                    Map<String, Object> payload = readObject(item.getBookPayloadJson());
                    return ProfileShelfItemResponse.builder()
                            .id(item.getId())
                            .type("book")
                            .title(firstNonBlank(text(payload, "title"), text(payload, "bookTitle"), item.getBookKey()))
                            .author(firstNonBlank(text(payload, "author"), text(payload, "writer"), text(payload, "subtitle")))
                            .image(firstNonBlank(text(payload, "coverUrl"), text(payload, "cover"), text(payload, "image"), text(payload, "imageUrl")))
                            .rating(item.getRating() == null ? null : item.getRating().intValue())
                            .progress(percent(item.getProgressPercent()))
                            .visibility(visibilityName(item.getVisibility()))
                            .build();
                })
                .collect(Collectors.toList());

        return List.of(
                ProfileShelfResponse.builder().id("playlists").title("Playlists / Nhạc yêu thích").items(musicItems).build(),
                ProfileShelfResponse.builder().id("library").title("Thư viện sách/truyện").items(bookItems).build()
        );
    }

    private List<Visibility> visibleScopes(User requester, User owner) {
        if (Objects.equals(requester.getId(), owner.getId())) {
            return List.of(Visibility.PUBLIC, Visibility.FRIENDS, Visibility.FOLLOWERS, Visibility.PRIVATE);
        }
        List<Visibility> scopes = new ArrayList<>();
        scopes.add(Visibility.PUBLIC);
        if (followRepository.existsByIdFollowerIdAndIdFolloweeId(requester.getId(), owner.getId())) {
            scopes.add(Visibility.FOLLOWERS);
        }
        if (friendshipRepository.existsById(new FriendshipId(owner.getId(), requester.getId()))) {
            scopes.add(Visibility.FRIENDS);
        }
        return scopes;
    }

    private boolean canView(Visibility visibility, User requester, User owner) {
        if (Objects.equals(requester.getId(), owner.getId())) return true;
        Visibility scope = visibility == null ? Visibility.PUBLIC : visibility;
        if (scope == Visibility.PUBLIC) return true;
        if (scope == Visibility.PRIVATE) return false;
        if (scope == Visibility.FOLLOWERS) {
            return followRepository.existsByIdFollowerIdAndIdFolloweeId(requester.getId(), owner.getId());
        }
        if (scope == Visibility.FRIENDS) {
            return friendshipRepository.existsById(new FriendshipId(owner.getId(), requester.getId()));
        }
        return false;
    }

    public void updateAvatar(Long userId, MultipartFile file) throws java.io.IOException {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        String avatarUrl = cloudinaryService.uploadFile(file, "soundbook/avatars");

        user.getProfile().setAvatarUrl(avatarUrl);
        userRepository.save(user);
    }

    public void updateCover(Long userId, MultipartFile file) throws java.io.IOException {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        String avatarUrl = cloudinaryService.uploadFile(file, "soundbook/avatars");

        user.getProfile().setCoverUrl(avatarUrl);
        userRepository.save(user);
    }

    private String visibilityName(Visibility visibility) {
        return (visibility == null ? Visibility.PUBLIC : visibility).name();
    }

    private Map<String, Object> readObject(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception exception) {
            return Collections.emptyMap();
        }
    }

    private String text(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private Integer percent(BigDecimal value) {
        if (value == null) return null;
        return Math.max(0, Math.min(100, value.setScale(0, RoundingMode.HALF_UP).intValue()));
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }
}
