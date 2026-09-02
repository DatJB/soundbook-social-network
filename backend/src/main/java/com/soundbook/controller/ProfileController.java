package com.soundbook.controller;

import com.soundbook.common.dto.ApiResponse;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.profile.BookShelfRequest;
import com.soundbook.dto.profile.MusicShelfRequest;
import com.soundbook.dto.profile.ProfileResponse;
import com.soundbook.dto.profile.ProfileUpdateRequest;
import com.soundbook.entity.User;
import com.soundbook.repository.UserRepository;
import com.soundbook.service.ProfileMutationService;
import com.soundbook.service.ProfileService;
import com.soundbook.service.FeedService;
import com.soundbook.dto.feed.FeedPostResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/profiles")
@RequiredArgsConstructor
public class ProfileController {

    private final UserRepository userRepository;
    private final ProfileService profileService;
    private final ProfileMutationService profileMutationService;
    private final FeedService feedService;

    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponse<ProfileResponse>> getProfile(Authentication authentication, @PathVariable String userId) {
        return ResponseEntity.ok(ApiResponse.success(profileService.getProfile(authentication.getName(), userId)));
    }

    @GetMapping("/{userId}/posts")
    public ResponseEntity<ApiResponse<java.util.List<FeedPostResponse>>> getProfilePosts(
            Authentication authentication,
            @PathVariable Long userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(ApiResponse.success(feedService.getProfilePostsPaged(authentication.getName(), userId, page, size)));
    }

    @GetMapping("/{userId}/followers")
    public ResponseEntity<ApiResponse<java.util.List<com.soundbook.dto.social.FriendUserResponse>>> getFollowers(Authentication authentication, @PathVariable String userId) {
        return ResponseEntity.ok(ApiResponse.success(profileService.getFollowers(authentication.getName(), userId)));
    }

    @GetMapping("/{userId}/followers/search")
    public ResponseEntity<ApiResponse<java.util.List<com.soundbook.dto.social.FriendUserResponse>>> searchFollowers(Authentication authentication, @PathVariable String userId, @RequestParam String query) {
        return ResponseEntity.ok(ApiResponse.success(profileService.searchFollowers(authentication.getName(), userId, query)));
    }

    @GetMapping("/{userId}/friends")
    public ResponseEntity<ApiResponse<java.util.List<com.soundbook.dto.social.FriendUserResponse>>> getFriends(Authentication authentication, @PathVariable String userId) {
        return ResponseEntity.ok(ApiResponse.success(profileService.getFriends(authentication.getName(), userId)));
    }

    @PutMapping("/me")
    public ResponseEntity<ApiResponse<ProfileResponse>> updateMyProfile(Authentication authentication, @RequestBody ProfileUpdateRequest request) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.updateProfile(authentication.getName(), request)));
    }

    @PostMapping("/{userId}/follow")
    public ResponseEntity<ApiResponse<ProfileResponse>> followProfile(Authentication authentication, @PathVariable Long userId) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.followProfile(authentication.getName(), userId)));
    }

    @DeleteMapping("/{userId}/follow")
    public ResponseEntity<ApiResponse<ProfileResponse>> unfollowProfile(Authentication authentication, @PathVariable Long userId) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.unfollowProfile(authentication.getName(), userId)));
    }

    @PostMapping("/me/music")
    public ResponseEntity<ApiResponse<ProfileResponse>> createMusic(Authentication authentication, @RequestBody MusicShelfRequest request) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.createMusic(authentication.getName(), request)));
    }

    @PutMapping("/me/music/{itemId}")
    public ResponseEntity<ApiResponse<ProfileResponse>> updateMusic(Authentication authentication, @PathVariable Long itemId, @RequestBody MusicShelfRequest request) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.updateMusic(authentication.getName(), itemId, request)));
    }

    @DeleteMapping("/me/music/{itemId}")
    public ResponseEntity<ApiResponse<ProfileResponse>> deleteMusic(Authentication authentication, @PathVariable Long itemId) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.deleteMusic(authentication.getName(), itemId)));
    }

    @PostMapping("/me/books")
    public ResponseEntity<ApiResponse<ProfileResponse>> createBook(Authentication authentication, @RequestBody BookShelfRequest request) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.createBook(authentication.getName(), request)));
    }

    @PutMapping("/me/books/{itemId}")
    public ResponseEntity<ApiResponse<ProfileResponse>> updateBook(Authentication authentication, @PathVariable Long itemId, @RequestBody BookShelfRequest request) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.updateBook(authentication.getName(), itemId, request)));
    }

    @DeleteMapping("/me/books/{itemId}")
    public ResponseEntity<ApiResponse<ProfileResponse>> deleteBook(Authentication authentication, @PathVariable Long itemId) {
        return ResponseEntity.ok(ApiResponse.success(profileMutationService.deleteBook(authentication.getName(), itemId)));
    }

    @PatchMapping(value = "/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<Void>> updateAvatar(
            @RequestParam("file") MultipartFile file) throws IOException
    {
        String currentEmail = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByEmail(currentEmail)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Long currentUserId = currentUser.getId();

        if (file.isEmpty())
        {
            throw new IllegalArgumentException("File ảnh không được để trống");
        }

        profileService.updateAvatar(currentUserId, file);

        return ResponseEntity.ok(ApiResponse.<Void>builder()
                .message("Cập nhật ảnh đại diện thành công")
                .build());
    }

    @PatchMapping(value = "/cover", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<Void>> updateCover(
            @RequestParam("file") MultipartFile file) throws IOException
    {
        String currentEmail = SecurityContextHolder.getContext().getAuthentication().getName();
        User currentUser = userRepository.findByEmail(currentEmail)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Long currentUserId = currentUser.getId();

        if (file.isEmpty())
        {
            throw new IllegalArgumentException("File ảnh không được để trống");
        }

        profileService.updateCover(currentUserId, file);

        return ResponseEntity.ok(ApiResponse.<Void>builder()
                .message("Cập nhật ảnh bìa thành công")
                .build());
    }
}
