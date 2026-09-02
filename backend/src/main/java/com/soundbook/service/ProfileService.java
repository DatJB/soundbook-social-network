package com.soundbook.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.feed.FeedPostResponse;
import com.soundbook.dto.profile.*;
import com.soundbook.dto.social.FriendUserResponse;
import com.soundbook.dto.taste.MatchUserResponse;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.Visibility;
import com.soundbook.repository.*;
import com.soundbook.service.admin.FileUploadService;
import io.jsonwebtoken.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProfileService {

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final FriendshipRepository friendshipRepository;
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

        MatchUserResponse match = null;
        if (!Objects.equals(requester.getId(), profileUser.getId())) {
            try {
                match = tasteDnaService.getMatchWithUser(requester.getEmail(), profileUser.getId());
            } catch (Exception ignored) {
                // profile remains usable for users without Taste DNA
            }
        }

        List<FriendUserResponse> friendsPreview = friendshipRepository.findByIdUserIdOrderByCreatedAtDesc(profileUser.getId()).stream()
                .limit(9)
                .map(friendship -> friendService.buildFriendUser(requester.getEmail(), friendship.getFriend()))
                .collect(Collectors.toList());

        List<FeedPostResponse> posts = feedService.getProfilePosts(requester.getEmail(), profileUser.getId(), 10);

        return ProfileResponse.builder()
                .userId(profileUser.getId())
                .displayName(profileUser.getDisplayName())
                .email(Objects.equals(requester.getId(), profileUser.getId()) ? profileUser.getEmail() : null)
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
                .matchScore(match == null ? 0 : match.getFinalMatch())
                .sharedFeatures(match == null ? List.of() : match.getSharedFeatures())
                .friendshipStatus(friendService.friendshipStatus(requester.getId(), profileUser.getId()))
                .following(isFollowing)
                .friendRequestId(friendService.friendRequestId(requester.getId(), profileUser.getId()))
                .canMessage(friendService.canMessage(requester.getId(), profileUser.getId()))
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

        return followRepository.findByIdFolloweeId(targetUser.getId()).stream()
                .map(follow -> {
                    User follower = userRepository.findById(follow.getId().getFollowerId()).orElse(null);
                    return follower != null ? friendService.buildFriendUser(requesterEmail, follower) : null;
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<FriendUserResponse> searchFollowers(String requesterEmail, String rawUserId, String query) {
        User requester = userRepository.findByEmail(requesterEmail).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        User targetUser = resolveProfileUser(requester, rawUserId);

        return followRepository.searchFollowers(targetUser.getId(), query).stream()
                .map(follow -> {
                    User follower = userRepository.findById(follow.getId().getFollowerId()).orElse(null);
                    return follower != null ? friendService.buildFriendUser(requesterEmail, follower) : null;
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<FriendUserResponse> getFriends(String requesterEmail, String rawUserId) {
        User requester = userRepository.findByEmail(requesterEmail).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        User targetUser = resolveProfileUser(requester, rawUserId);

        return friendshipRepository.findByIdUserIdOrderByCreatedAtDesc(targetUser.getId()).stream()
                .map(friendship -> friendService.buildFriendUser(requesterEmail, friendship.getFriend()))
                .collect(Collectors.toList());
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

    public void updateAvatar(Long userId, MultipartFile file) throws java.io.IOException
    {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        String avatarUrl = cloudinaryService.uploadFile(file, "soundbook/avatars");

        user.getProfile().setAvatarUrl(avatarUrl);
        userRepository.save(user);
    }

    public void updateCover(Long userId, MultipartFile file) throws java.io.IOException
    {
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
