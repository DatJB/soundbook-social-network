package com.soundbook.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.profile.BookShelfRequest;
import com.soundbook.dto.profile.MusicShelfRequest;
import com.soundbook.dto.profile.ProfileResponse;
import com.soundbook.dto.profile.ProfileUpdateRequest;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.BookshelfCode;
import com.soundbook.entity.enums.CollectionItemType;
import com.soundbook.entity.enums.NotificationType;
import com.soundbook.entity.enums.TargetType;
import com.soundbook.entity.enums.ThemeMode;
import com.soundbook.entity.enums.Visibility;
import com.soundbook.event.NotificationEvent;
import com.soundbook.messaging.NotificationProducer;
import com.soundbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProfileMutationService {

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final UserMusicCollectionRepository musicCollectionRepository;
    private final UserBookshelfItemRepository bookshelfItemRepository;
    private final BookshelfRepository bookshelfRepository;
    private final FollowRepository followRepository;
    private final ProfileService profileService;
    private final NotificationProducer notificationProducer;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Transactional
    public ProfileResponse updateProfile(String email, ProfileUpdateRequest request) {
        User user = currentUser(email);
        if (request.getDisplayName() != null && !request.getDisplayName().isBlank()) {
            user.setDisplayName(request.getDisplayName().trim());
            userRepository.save(user);
        }
        UserProfile profile = userProfileRepository.findById(user.getId()).orElseGet(() -> UserProfile.builder()
                .user(user)
                .username(defaultUsername(user))
                .themeMode(ThemeMode.AUTO)
                .bioVisibility(Visibility.PUBLIC)
                .publicInfoVisibility(Visibility.PUBLIC)
                .pinnedTrackVisibility(Visibility.PUBLIC)
                .allowPreviewPlayer(true)
                .build());
        if (request.getUsername() != null && !request.getUsername().isBlank()) {
            String username = normalizeUsername(request.getUsername());
            if (!username.equals(profile.getUsername()) && userProfileRepository.existsByUsername(username)) {
                throw new AppException(ErrorCode.INVALID_REQUEST);
            }
            profile.setUsername(username);
        }
        if (request.getBio() != null) profile.setBio(blankToNull(request.getBio()));
        if (request.getPublicInfo() != null) profile.setPublicInfo(blankToNull(request.getPublicInfo()));
        if (request.getBioVisibility() != null) profile.setBioVisibility(request.getBioVisibility());
        if (request.getPublicInfoVisibility() != null) profile.setPublicInfoVisibility(request.getPublicInfoVisibility());
        if (request.getAvatarUrl() != null) profile.setAvatarUrl(blankToNull(request.getAvatarUrl()));
        if (request.getCoverUrl() != null) profile.setCoverUrl(blankToNull(request.getCoverUrl()));
        if (request.getPinnedTrackId() != null) profile.setPinnedTrackId(normalizeYouTubeId(request.getPinnedTrackId()));
        if (request.getPinnedTrackVisibility() != null) profile.setPinnedTrackVisibility(request.getPinnedTrackVisibility());
        if (request.getAllowPreviewPlayer() != null) profile.setAllowPreviewPlayer(request.getAllowPreviewPlayer());
        userProfileRepository.save(profile);
        return profileService.getProfile(email, "me");
    }

    @Transactional
    public ProfileResponse createMusic(String email, MusicShelfRequest request) {
        User user = currentUser(email);
        musicCollectionRepository.save(UserMusicCollection.builder()
                .user(user)
                .itemType(request.getItemType() == null ? CollectionItemType.TRACK : request.getItemType())
                .itemId(blankToNull(request.getItemId()) == null ? UUID.randomUUID().toString() : request.getItemId().trim())
                .title(required(request.getTitle()))
                .subtitle(blankToNull(request.getSubtitle()))
                .coverUrl(blankToNull(request.getCoverUrl()))
                .previewUrl(blankToNull(request.getPreviewUrl()))
                .visibility(request.getVisibility() == null ? Visibility.PUBLIC : request.getVisibility())
                .sortOrder(request.getSortOrder() == null ? 0 : request.getSortOrder())
                .build());
        return profileService.getProfile(email, "me");
    }

    @Transactional
    public ProfileResponse updateMusic(String email, Long itemId, MusicShelfRequest request) {
        User user = currentUser(email);
        UserMusicCollection item = musicCollectionRepository.findById(itemId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        requireOwner(user, item.getUser());
        if (request.getItemType() != null) item.setItemType(request.getItemType());
        if (request.getItemId() != null) item.setItemId(required(request.getItemId()));
        if (request.getTitle() != null) item.setTitle(required(request.getTitle()));
        if (request.getSubtitle() != null) item.setSubtitle(blankToNull(request.getSubtitle()));
        if (request.getCoverUrl() != null) item.setCoverUrl(blankToNull(request.getCoverUrl()));
        if (request.getPreviewUrl() != null) item.setPreviewUrl(blankToNull(request.getPreviewUrl()));
        if (request.getVisibility() != null) item.setVisibility(request.getVisibility());
        if (request.getSortOrder() != null) item.setSortOrder(request.getSortOrder());
        musicCollectionRepository.save(item);
        return profileService.getProfile(email, "me");
    }

    @Transactional
    public ProfileResponse deleteMusic(String email, Long itemId) {
        User user = currentUser(email);
        UserMusicCollection item = musicCollectionRepository.findById(itemId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        requireOwner(user, item.getUser());
        musicCollectionRepository.delete(item);
        return profileService.getProfile(email, "me");
    }

    @Transactional
    public ProfileResponse createBook(String email, BookShelfRequest request) {
        User user = currentUser(email);
        Bookshelf shelf = findShelf(request.getShelfCode());
        bookshelfItemRepository.save(UserBookshelfItem.builder()
                .user(user)
                .shelf(shelf)
                .bookKey(blankToNull(request.getBookKey()) == null ? UUID.randomUUID().toString() : request.getBookKey().trim())
                .bookPayloadJson(toBookJson(request))
                .progressPage(request.getProgressPage())
                .progressPercent(request.getProgressPercent())
                .rating(request.getRating())
                .visibility(request.getVisibility() == null ? Visibility.PUBLIC : request.getVisibility())
                .build());
        return profileService.getProfile(email, "me");
    }

    @Transactional
    public ProfileResponse updateBook(String email, Long itemId, BookShelfRequest request) {
        User user = currentUser(email);
        UserBookshelfItem item = bookshelfItemRepository.findById(itemId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        requireOwner(user, item.getUser());
        if (request.getShelfCode() != null) item.setShelf(findShelf(request.getShelfCode()));
        if (request.getBookKey() != null) item.setBookKey(required(request.getBookKey()));
        item.setBookPayloadJson(toBookJson(request));
        item.setProgressPage(request.getProgressPage());
        item.setProgressPercent(request.getProgressPercent());
        item.setRating(request.getRating());
        if (request.getVisibility() != null) item.setVisibility(request.getVisibility());
        bookshelfItemRepository.save(item);
        return profileService.getProfile(email, "me");
    }

    @Transactional
    public ProfileResponse deleteBook(String email, Long itemId) {
        User user = currentUser(email);
        UserBookshelfItem item = bookshelfItemRepository.findById(itemId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        requireOwner(user, item.getUser());
        bookshelfItemRepository.delete(item);
        return profileService.getProfile(email, "me");
    }

    @Transactional
    public ProfileResponse followProfile(String email, Long targetUserId) {
        User current = currentUser(email);
        User target = userRepository.findById(targetUserId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        if (Objects.equals(current.getId(), target.getId())) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        FollowId id = new FollowId(current.getId(), target.getId());
        if (!userProfileRepository.existsById(target.getId())) {
            userProfileRepository.save(UserProfile.builder()
                    .user(target)
                    .username(defaultUsername(target))
                    .themeMode(ThemeMode.AUTO)
                    .bioVisibility(Visibility.PUBLIC)
                    .publicInfoVisibility(Visibility.PUBLIC)
                    .pinnedTrackVisibility(Visibility.PUBLIC)
                    .allowPreviewPlayer(true)
                    .build());
        }
        if (!userRepository.existsById(target.getId())) {
            throw new AppException(ErrorCode.USER_NOT_FOUND);
        }
        if (!profileFollowExists(id)) {
            musicFollowSave(current, target, id);
            notificationProducer.publish(
                    new NotificationEvent(
                            target.getId(),
                            current.getId(),
                            NotificationType.FOLLOW,
                            TargetType.USER,
                            current.getId(),
                            current.getDisplayName() + " đã bắt đầu theo dõi bạn."
                    )
            );
        }
        return profileService.getProfile(email, String.valueOf(targetUserId));
    }

    @Transactional
    public ProfileResponse unfollowProfile(String email, Long targetUserId) {
        User current = currentUser(email);
        if (Objects.equals(current.getId(), targetUserId)) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        FollowId id = new FollowId(current.getId(), targetUserId);
        userRepository.findById(targetUserId).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        userRepository.flush();
        // Delete only if present to keep the endpoint idempotent for the UI.
        followRepository.findById(id).ifPresent(followRepository::delete);
        return profileService.getProfile(email, String.valueOf(targetUserId));
    }

    private boolean profileFollowExists(FollowId id) {
        return followRepository.existsById(id);
    }

    private void musicFollowSave(User current, User target, FollowId id) {
        followRepository.save(Follow.builder()
                .id(id)
                .follower(current)
                .followee(target)
                .build());
    }

    private User currentUser(String email) {
        return userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private Bookshelf findShelf(BookshelfCode code) {
        return bookshelfRepository.findByCode(code == null ? BookshelfCode.WILL_READ : code)
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
    }

    private void requireOwner(User current, User owner) {
        if (!Objects.equals(current.getId(), owner.getId())) throw new AppException(ErrorCode.UNAUTHORIZED);
    }

    private String toBookJson(BookShelfRequest request) {
        try {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("title", required(request.getTitle()));
            map.put("author", blankToNull(request.getAuthor()));
            map.put("coverUrl", blankToNull(request.getCoverUrl()));
            map.put("description", blankToNull(request.getDescription()));
            return objectMapper.writeValueAsString(map);
        } catch (Exception exception) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }

    private String normalizeUsername(String username) {
        return username.trim().replaceFirst("^@+", "").toLowerCase();
    }

    private String defaultUsername(User user) {
        return ("user" + user.getId());
    }

    private String required(String value) {
        String trimmed = blankToNull(value);
        if (trimmed == null) throw new AppException(ErrorCode.INVALID_REQUEST);
        return trimmed;
    }

    private String normalizeYouTubeId(String value) {
        String raw = blankToNull(value);
        if (raw == null) return null;
        String trimmed = raw.trim();
        int watchIndex = trimmed.indexOf("v=");
        if (watchIndex >= 0) {
            String id = trimmed.substring(watchIndex + 2);
            int amp = id.indexOf('&');
            return amp >= 0 ? id.substring(0, amp) : id;
        }
        int shortIndex = trimmed.indexOf("youtu.be/");
        if (shortIndex >= 0) {
            String id = trimmed.substring(shortIndex + "youtu.be/".length());
            int query = id.indexOf('?');
            return query >= 0 ? id.substring(0, query) : id;
        }
        return trimmed;
    }

    private String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
