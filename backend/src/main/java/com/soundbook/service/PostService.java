package com.soundbook.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.common.response.PageResponse;
import com.soundbook.dto.feed.FeedCommentResponse;
import com.soundbook.dto.feed.FeedPostResponse;
import com.soundbook.dto.socialcontent.PostCommentRequest;
import com.soundbook.dto.socialcontent.PostMutationRequest;
import com.soundbook.dto.socialcontent.PostReactionRequest;
import com.soundbook.dto.socialcontent.PostShareRequest;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.*;
import com.soundbook.event.PostChangedEvent;
import com.soundbook.messaging.RabbitMQProducer;
import com.soundbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class PostService {

    private final UserRepository userRepository;
    private final PostRepository postRepository;
    private final PostMediaRepository postMediaRepository;
    private final CommentRepository commentRepository;
    private final ReactionRepository reactionRepository;
    private final FeedService feedService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RabbitMQProducer rabbitMQProducer;

    public FeedPostResponse getPostDetail(String email, Long postId) {
        return feedService.getPost(email, postId);
    }

    @Transactional
    public FeedPostResponse createPost(String email, PostMutationRequest request) {
        User user = currentUser(email);

        PostType actualType = request.getType() == null ? PostType.BLOG : request.getType();
        validatePostAttachment(actualType, request);

        Post post = Post.builder()
                .user(user)
                .type(actualType)
                .visibility(request.getVisibility() == null ? Visibility.PUBLIC : request.getVisibility())
                .caption(blankToNull(request.getCaption()))
                .contentRich(blankToNull(request.getContentRich()))
                .moodTag(blankToNull(request.getMoodTag()))
                .commentsEnabled(request.getCommentsEnabled() == null || Boolean.TRUE.equals(request.getCommentsEnabled()))
                .refJson(isJsonType(actualType) ? blankToNull(request.getRefJson()) : null)
                .build();

        Post saved = postRepository.save(post);
        saveMediaIfPresent(saved, request);

        // Publish event cho RabbitMQ
        rabbitMQProducer.publishPostChanged(
                saved.getUser().getId(),
                saved.getId(),
                PostChangedEvent.Action.CREATED
        );

        return feedService.getPost(email, saved.getId());
    }

    private void validatePostAttachment(PostType type, PostMutationRequest request)
    {
        boolean hasRefJson = blankToNull(request.getRefJson()) != null;

        if (type == PostType.BLOG && hasRefJson)
        {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }

        if (isJsonType(type) && !hasRefJson)
        {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }

    private boolean isJsonType(PostType type)
    {
        return type == PostType.MUSIC_QUICK_NOTE ||
                type == PostType.BOOK_READING_UPDATE ||
                type == PostType.BOOK_QUOTE_CARD ||
                type == PostType.BOOK_REVIEW;
    }

    @Transactional
    public FeedPostResponse updatePost(String email, Long postId, PostMutationRequest request) {
        User user = currentUser(email);
        Post post = ownPost(user, postId);
        PostType actualType = request.getType() != null ? request.getType() : post.getType();

        validatePostAttachment(actualType, request);

        post.setType(actualType);
        if (request.getVisibility() != null) post.setVisibility(request.getVisibility());

        if (request.getType() != null) post.setType(request.getType());
        post.setCaption(blankToNull(request.getCaption()));
        post.setContentRich(blankToNull(request.getContentRich()));
        post.setMoodTag(blankToNull(request.getMoodTag()));
        post.setRefJson(isJsonType(actualType) ? blankToNull(request.getRefJson()) : null);
        if (request.getCommentsEnabled() != null) post.setCommentsEnabled(request.getCommentsEnabled());

        postRepository.save(post);
        updateMedia(post, request);

        // Publish event cho RabbitMQ
        rabbitMQProducer.publishPostChanged(
                post.getUser().getId(),
                post.getId(),
                PostChangedEvent.Action.UPDATED
        );

        return feedService.getPost(email, post.getId());
    }

    private void updateMedia(Post post, PostMutationRequest request)
    {
        String newUrl = blankToNull(request.getMediaUrl());

        postMediaRepository.deleteByPost_Id(post.getId());

        if (newUrl != null)
        {
            PostMedia media = PostMedia.builder()
                    .post(post)
                    .url(newUrl)
                    .mediaType(request.getMediaType() == null ? MediaType.IMAGE : request.getMediaType())
                    .build();
            postMediaRepository.save(media);
        }
    }

    @Transactional
    public void deletePost(String email, Long postId) {
        User user = currentUser(email);
        Post post = ownPost(user, postId);
//        commentRepository.deleteByPostId(post.getId());
//        reactionRepository.deleteByTargetTypeAndTargetId(TargetType.POST, post.getId());
//        postMediaRepository.deleteByPost_Id(post.getId());
        post.setStatus(PostStatus.DELETED);

        rabbitMQProducer.publishPostChanged(
                post.getUser().getId(),
                post.getId(),
                PostChangedEvent.Action.DELETED
        );

        postRepository.save(post);
    }

    @Transactional
    public FeedPostResponse toggleComments(String email, Long postId, boolean enabled) {
        User user = currentUser(email);
        Post post = ownPost(user, postId);
        post.setCommentsEnabled(enabled);
        postRepository.save(post);
        return feedService.getPost(email, postId);
    }

    @Transactional
    public FeedPostResponse react(String email, Long postId, PostReactionRequest request) {
        User user = currentUser(email);
        Post post = postRepository.findById(postId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        ReactionType newType = request == null ? ReactionType.LIKE : request.getReactionType();
        reactionRepository.findByUser_IdAndTargetTypeAndTargetId(user.getId(), TargetType.POST, post.getId()).ifPresentOrElse(existing -> {
            if (newType == null || existing.getReactionType() == newType) {
                reactionRepository.delete(existing);
            } else {
                existing.setReactionType(newType);
                reactionRepository.save(existing);
            }
        }, () -> {
            if (newType != null) {
                reactionRepository.save(Reaction.builder()
                        .user(user)
                        .targetType(TargetType.POST)
                        .targetId(post.getId())
                        .reactionType(newType)
                        .build());
            }
        });
        return feedService.getPost(email, post.getId());
    }

    @Transactional
    public void reactComment(String email, Long commentId, PostReactionRequest request) {
        User user = currentUser(email);
        Comment comment = commentRepository.findById(commentId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        ReactionType newType = request == null ? ReactionType.LIKE : request.getReactionType();
        reactionRepository.findByUser_IdAndTargetTypeAndTargetId(user.getId(), TargetType.COMMENT, comment.getId()).ifPresentOrElse(existing -> {
            if (newType == null || existing.getReactionType() == newType) {
                reactionRepository.delete(existing);
            } else {
                existing.setReactionType(newType);
                reactionRepository.save(existing);
            }
        }, () -> {
            if (newType != null) {
                reactionRepository.save(Reaction.builder()
                        .user(user)
                        .targetType(TargetType.COMMENT)
                        .targetId(comment.getId())
                        .reactionType(newType)
                        .build());
            }
        });
    }

    @Transactional
    public FeedCommentResponse comment(String email, Long postId, PostCommentRequest request) {
        User user = currentUser(email);
        Post post = postRepository.findById(postId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        if (!Boolean.TRUE.equals(post.getCommentsEnabled())) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        String content = request == null ? null : blankToNull(request.getContent());
        if (content == null) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
        Comment parent = null;
        if (request.getParentId() != null) {
            parent = commentRepository.findById(request.getParentId()).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        }
        Comment saved = commentRepository.save(Comment.builder()
                .post(post)
                .user(user)
                .parent(parent)
                .content(content)
                .build());
        return FeedCommentResponse.builder()
                .id(saved.getId())
                .parentId(saved.getParent() != null ? saved.getParent().getId() : null)
                .text(saved.getContent())
                .createdAt(saved.getCreatedAt())
                .user(com.soundbook.dto.feed.FeedUserResponse.builder()
                        .userId(user.getId())
                        .displayName(user.getDisplayName())
                        .avatarUrl(user.getProfile() != null ? user.getProfile().getAvatarUrl() : null)
                        .username(user.getProfile() != null ? user.getProfile().getUsername() : null)
                        .build())
                .build();
    }

    @Transactional(readOnly = true)
    public com.soundbook.dto.common.response.PageResponse<FeedCommentResponse> getPostComments(String email, Long postId, int page, int size) {
        User currentUser = currentUser(email);
        org.springframework.data.domain.Page<Comment> commentPage = commentRepository.findByPostIdAndParentIsNullOrderByCreatedAtDesc(
                postId, org.springframework.data.domain.PageRequest.of(page, size));
        java.util.List<Comment> commentList = new java.util.ArrayList<>(commentPage.getContent());
        
        java.util.Collections.reverse(commentList);
        
        long total = commentRepository.countByPost_IdAndParentIsNullAndStatusNot(postId, CommentStatus.DELETED);
        
        return com.soundbook.dto.common.response.PageResponse.<FeedCommentResponse>builder()
                .content(commentList.stream().map(comment -> FeedCommentResponse.builder()
                        .id(comment.getId())
                        .parentId(comment.getParent() != null ? comment.getParent().getId() : null)
                        .text(comment.getContent())
                        .createdAt(comment.getCreatedAt())
                        .replyCount(commentRepository.countByParent_IdAndStatusNot(comment.getId(), CommentStatus.DELETED))
                        .reactsCount(reactionRepository.countByTargetIdAndTargetType(comment.getId(), TargetType.COMMENT))
                        .currentUserReaction(reactionRepository.findByUser_IdAndTargetTypeAndTargetId(currentUser.getId(), TargetType.COMMENT, comment.getId())
                                .map(r -> r.getReactionType().name()).orElse(null))
                        .user(com.soundbook.dto.feed.FeedUserResponse.builder()
                                .userId(comment.getUser().getId())
                                .displayName(comment.getUser().getDisplayName())
                                .avatarUrl(comment.getUser().getProfile() != null ? comment.getUser().getProfile().getAvatarUrl() : null)
                                .username(comment.getUser().getProfile() != null ? comment.getUser().getProfile().getUsername() : null)
                                .build())
                        .build()).toList())
                .pageNumber(page)
                .pageSize(size)
                .totalElements(total)
                .totalPages((int) Math.ceil((double) total / size))
                .isFirst(page == 0)
                .isLast((long) (page + 1) * size >= total)
                .build();
    }

    @Transactional(readOnly = true)
    public java.util.List<FeedCommentResponse> getCommentReplies(String email, Long commentId) {
        User currentUser = currentUser(email);
        java.util.List<Comment> replies = commentRepository.findAll().stream()
                .filter(c -> c.getParent() != null && c.getParent().getId().equals(commentId) && c.getStatus() != CommentStatus.DELETED)
                .sorted(java.util.Comparator.comparing(Comment::getCreatedAt))
                .toList();

        return replies.stream().map(comment -> FeedCommentResponse.builder()
                .id(comment.getId())
                .parentId(commentId)
                .text(comment.getContent())
                .createdAt(comment.getCreatedAt())
                .reactsCount(reactionRepository.countByTargetIdAndTargetType(comment.getId(), TargetType.COMMENT))
                .currentUserReaction(reactionRepository.findByUser_IdAndTargetTypeAndTargetId(currentUser.getId(), TargetType.COMMENT, comment.getId())
                        .map(r -> r.getReactionType().name()).orElse(null))
                .user(com.soundbook.dto.feed.FeedUserResponse.builder()
                        .userId(comment.getUser().getId())
                        .displayName(comment.getUser().getDisplayName())
                        .avatarUrl(comment.getUser().getProfile() != null ? comment.getUser().getProfile().getAvatarUrl() : null)
                        .username(comment.getUser().getProfile() != null ? comment.getUser().getProfile().getUsername() : null)
                        .build())
                .build()).toList();
    }

    @Transactional
    public void deleteComment(String email, Long commentId) {
        User user = currentUser(email);
        Comment comment = commentRepository.findById(commentId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        if (!Objects.equals(comment.getUser().getId(), user.getId()) && !Objects.equals(comment.getPost().getUser().getId(), user.getId())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
//        reactionRepository.deleteByTargetTypeAndTargetId(TargetType.COMMENT, comment.getId());
        comment.setStatus(CommentStatus.DELETED);
        commentRepository.save(comment);
    }

    @Transactional
    public FeedPostResponse share(String email, Long postId, PostShareRequest request) {
        User user = currentUser(email);
        Post original = postRepository.findById(postId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        original.setShareCount((original.getShareCount() == null ? 0L : original.getShareCount()) + 1L);
        postRepository.save(original);
        String shareCaption = blankToNull(request == null ? null : request.getCaption());
        PostMedia originalMedia = postMediaRepository.findFirstByPost_IdOrderByIdAsc(original.getId()).orElse(null);
        String refJson = buildSharedRefJson(original, originalMedia);
        Post share = postRepository.save(Post.builder()
                .user(user)
                .type(PostType.BLOG)
                .visibility(request == null || request.getVisibility() == null ? Visibility.PUBLIC : request.getVisibility())
                .caption(shareCaption == null ? "Đã chia sẻ một bài viết trên Soundbook." : shareCaption)
                .refJson(refJson)
                .commentsEnabled(true)
                .shareCount(0L)
                .build());
        return feedService.getPost(email, share.getId());
    }


    private String buildSharedRefJson(Post original, PostMedia media) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sharedPostId", original.getId());
            payload.put("sharedAuthorId", original.getUser().getId());
            payload.put("sharedAuthor", original.getUser().getDisplayName());
            payload.put("sharedAuthorUsername", original.getUser().getProfile() != null ? original.getUser().getProfile().getUsername() : null);
            
            String avatarUrl = null;
            if (original.getUser().getProfile() != null) {
                avatarUrl = original.getUser().getProfile().getAvatarUrl();
            }
            payload.put("sharedAuthorAvatar", avatarUrl);
            
            payload.put("sharedCaption", original.getCaption());
            payload.put("sharedCreatedAt", original.getCreatedAt().toString());
            payload.put("sharedType", original.getType().name());

            // Copy original refJson data if it exists
            if (original.getRefJson() != null && !original.getRefJson().isBlank()) {
                try {
                    Map<String, Object> originalRef = objectMapper.readValue(original.getRefJson(), Map.class);
                    payload.putAll(originalRef);
                } catch (Exception ignored) {}
            }

            if (media != null) {
                payload.put("thumbnail", media.getUrl());
                payload.put("mediaType", media.getMediaType().name());
            }
            
            return objectMapper.writeValueAsString(payload);
        } catch (Exception exception) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }

    private Post ownPost(User user, Long postId) {
        Post post = postRepository.findById(postId).orElseThrow(() -> new AppException(ErrorCode.INVALID_REQUEST));
        if (!Objects.equals(post.getUser().getId(), user.getId())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }
        return post;
    }

    private User currentUser(String email) {
        return userRepository.findByEmail(email).orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private void saveMediaIfPresent(Post post, PostMutationRequest request) {
        if (request.getMediaUrl() == null || request.getMediaUrl().isBlank()) return;
        postMediaRepository.save(PostMedia.builder()
                .post(post)
                .mediaType(request.getMediaType() == null ? MediaType.IMAGE : request.getMediaType())
                .url(request.getMediaUrl().trim())
                .build());
    }

    private String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
