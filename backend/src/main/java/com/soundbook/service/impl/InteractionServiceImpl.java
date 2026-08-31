package com.soundbook.service.impl;

import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.soundbook.dto.feed.FeedCommentResponse;
import com.soundbook.dto.feed.FeedUserResponse;
import com.soundbook.dto.socialcontent.PostCommentRequest;
import com.soundbook.dto.socialcontent.PostReactionRequest;
import com.soundbook.dto.websocket.PostLiveEvent;
import com.soundbook.entity.Comment;
import com.soundbook.entity.Post;
import com.soundbook.entity.Reaction;
import com.soundbook.entity.User;
import com.soundbook.entity.enums.CommentStatus;
import com.soundbook.entity.enums.LiveEventType;
import com.soundbook.entity.enums.NotificationType;
import com.soundbook.entity.enums.TargetType;
import com.soundbook.repository.CommentRepository;
import com.soundbook.repository.PostRepository;
import com.soundbook.repository.ReactionRepository;
import com.soundbook.repository.UserRepository;
import com.soundbook.service.InteractionService;
import com.soundbook.service.NotificationService;
import com.soundbook.service.ReactionService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class InteractionServiceImpl implements InteractionService
{
    private final UserRepository userRepository;
    private final ReactionRepository reactionRepository;
    private final PostRepository postRepository;
    private final CommentRepository commentRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final NotificationService notificationService;

    @Override
    @Transactional
    public FeedCommentResponse addComment(String email, Long postId, PostCommentRequest request)
    {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new AppException(ErrorCode.POST_NOT_FOUND));

        Comment parent = null;
        if (request.getParentId() != null)
        {
            parent = commentRepository.findById(request.getParentId())
                    .orElseThrow(() -> new AppException(ErrorCode.COMMENT_NOT_FOUND));
        }

        Comment comment = Comment.builder()
                .post(post)
                .user(user)
                .parent(parent)
                .content(request.getContent())
                .status(CommentStatus.ACTIVE)
                .build();
        comment = commentRepository.save(comment);

        FeedUserResponse userResponse = FeedUserResponse.builder()
                .userId(user.getId())
                .displayName(user.getDisplayName())
                .avatarUrl(user.getProfile().getAvatarUrl())
                .build();

        FeedCommentResponse response = FeedCommentResponse.builder()
                .id(comment.getId())
                .parentId(parent != null ? parent.getId() : null)
                .user(userResponse)
                .text(comment.getContent())
                .createdAt(comment.getCreatedAt())
                .reactsCount(0L)
                .replyCount(0L)
                .currentUserReaction(null)
                .build();


        broadcastEvent(postId, LiveEventType.NEW_COMMENT, user.getId(), response);

        // Gửi notification cho chủ bài viết (không tự gửi cho chính mình)
        if (!Objects.equals(user.getId(), post.getUser().getId())) {
            notificationService.send(
                    post.getUser().getId(),
                    user.getId(),
                    NotificationType.COMMENT,
                    TargetType.POST,
                    post.getId(),
                    user.getDisplayName() + " đã bình luận về bài viết của bạn"
            );
        }

        return response;
    }

    @Override
    @Transactional
    public void deleteComment(String email, Long commentId)
    {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new AppException(ErrorCode.COMMENT_NOT_FOUND));

        comment.setStatus(CommentStatus.DELETED);
        Long postId = comment.getPost().getId();
        broadcastEvent(postId, LiveEventType.DELETE_COMMENT, user.getId(), Map.of("commentId", commentId));
    }

    @Override
    public void reactToPost(String email, Long postId, PostReactionRequest request)
    {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new AppException(ErrorCode.POST_NOT_FOUND));

        Optional<Reaction> existingReaction = reactionRepository
                .findByUserIdAndTargetIdAndTargetType(user.getId(), postId, TargetType.POST);

        if (existingReaction.isPresent())
        {
            Reaction reaction = existingReaction.get();
            if (reaction.getReactionType() == request.getReactionType())
            {
                reactionRepository.delete(reaction);
            } else
            {
                reaction.setReactionType(request.getReactionType());
            }
        } else
        {
            Reaction newReaction = Reaction.builder()
                    .user(user)
                    .targetId(postId)
                    .targetType(TargetType.POST)
                    .reactionType(request.getReactionType())
                    .build();
            reactionRepository.save(newReaction);
        }

        long totalReactions = reactionRepository.countByTargetIdAndTargetType(postId, TargetType.POST);
        java.util.List<String> types = reactionRepository.findDistinctReactionTypesByTargetIdAndTargetType(postId, TargetType.POST)
                .stream().map(Enum::name).toList();

        broadcastEvent(postId, LiveEventType.REACT_POST, user.getId(),
                Map.of("total", totalReactions, "types", types));

        // Gửi notification LIKE khi tạo reaction mới (không tự gửi cho chính mình)
        if (!existingReaction.isPresent() && !Objects.equals(user.getId(), post.getUser().getId())) {
            notificationService.send(
                    post.getUser().getId(),
                    user.getId(),
                    NotificationType.LIKE,
                    TargetType.POST,
                    postId,
                    user.getDisplayName() + " đã thích bài viết của bạn"
            );
        }
    }

    @Override
    public void reactToComment(String email, Long commentId, PostReactionRequest request)
    {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));

        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new AppException(ErrorCode.COMMENT_NOT_FOUND));

        Optional<Reaction> existingReaction = reactionRepository
                .findByUserIdAndTargetIdAndTargetType(user.getId(), commentId, TargetType.COMMENT);

        if (existingReaction.isPresent())
        {
            Reaction reaction = existingReaction.get();
            if (reaction.getReactionType() == request.getReactionType())
            {
                reactionRepository.delete(reaction);
            } else
            {
                reaction.setReactionType(request.getReactionType());
            }
        } else
        {
            Reaction newReaction = Reaction.builder()
                    .user(user)
                    .targetId(commentId)
                    .targetType(TargetType.COMMENT)
                    .reactionType(request.getReactionType())
                    .build();
            reactionRepository.save(newReaction);
        }

        Long postId = comment.getPost().getId();
        long totalReactions = reactionRepository.countByTargetIdAndTargetType(commentId, TargetType.COMMENT);
        java.util.List<String> types = reactionRepository.findDistinctReactionTypesByTargetIdAndTargetType(commentId, TargetType.COMMENT)
                .stream().map(Enum::name).toList();

        broadcastEvent(postId, LiveEventType.REACT_COMMENT, user.getId(),
                Map.of("commentId", commentId, "total", totalReactions, "types", types));
    }

    private void broadcastEvent(Long postId, LiveEventType type, Long actorId, Object payload)
    {
        PostLiveEvent event = PostLiveEvent.builder()
                .eventType(type)
                .actorId(actorId)
                .payload(payload)
                .build();
        messagingTemplate.convertAndSend("/topic/posts/" + postId, event);
    }
}
