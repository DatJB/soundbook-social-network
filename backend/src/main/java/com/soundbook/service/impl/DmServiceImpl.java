package com.soundbook.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soundbook.common.exception.AppException;
import com.soundbook.common.exception.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.soundbook.dto.dm.*;
import com.soundbook.entity.*;
import com.soundbook.entity.enums.MessageType;
import com.soundbook.repository.*;
import com.soundbook.service.DmService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

@Service
@RequiredArgsConstructor
@Transactional
public class DmServiceImpl implements DmService {

    private static final String MODE_FOR_ME = "forMe";
    private static final String MODE_FOR_EVERYONE = "forEveryone";
    private static final String REACTIONS_BY_USER = "reactionsByUser";

    private final DmThreadRepository dmThreadRepository;
    private final DmMessageRepository dmMessageRepository;
    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final FriendshipRepository friendshipRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public DmThreadResponse upsertThread(DmThreadUpsertRequest request) {
        if (Objects.equals(request.getUserId(), request.getPeerUserId())) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }

        User user = getUser(request.getUserId());
        User peer = getUser(request.getPeerUserId());

        if (!friendshipRepository.existsByIdUserIdAndIdFriendId(user.getId(), peer.getId())) {
            throw new AppException(ErrorCode.UNAUTHORIZED);
        }

        long user1Id = Math.min(user.getId(), peer.getId());
        long user2Id = Math.max(user.getId(), peer.getId());

        DmThread thread = dmThreadRepository.findByUser1_IdAndUser2_Id(user1Id, user2Id)
                .orElseGet(() -> dmThreadRepository.save(DmThread.builder()
                        .user1(user1Id == user.getId() ? user : peer)
                        .user2(user2Id == user.getId() ? user : peer)
                        .build()));

        return toThreadResponse(thread, user.getId());
    }

    @Override
    @Transactional(readOnly = true)
    public DmCursorPageResponse<DmThreadResponse> getThreads(Long userId, String cursor, int limit) {
        getUser(userId);
        int sanitizedLimit = Math.max(1, Math.min(limit, 100));

        CursorPayload cursorPayload = parseCursor(cursor);
        List<DmThread> threads = dmThreadRepository.findThreadsByUserWithCursor(
                userId,
                cursorPayload.createdAt,
                cursorPayload.id,
                PageRequest.of(0, sanitizedLimit)
        );

        List<DmThreadResponse> items = threads.stream()
                .map(thread -> toThreadResponse(thread, userId))
                .toList();

        String nextCursor = threads.size() < sanitizedLimit ? null : toCursor(
                threads.get(threads.size() - 1).getUpdatedAt(),
                threads.get(threads.size() - 1).getId()
        );

        return DmCursorPageResponse.<DmThreadResponse>builder()
                .items(items)
                .nextCursor(nextCursor)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public DmCursorPageResponse<DmMessageResponse> getThreadMessages(Long threadId, Long userId, String cursor, int limit) {
        DmThread thread = getThreadWithAccess(threadId, userId);
        int sanitizedLimit = Math.max(1, Math.min(limit, 100));

        CursorPayload cursorPayload = parseCursor(cursor);
        List<DmMessage> messages = dmMessageRepository.findVisibleMessagesWithCursor(
                thread.getId(),
                userId,
                cursorPayload.createdAt,
                cursorPayload.id,
                PageRequest.of(0, sanitizedLimit)
        );

        List<DmMessageResponse> items = toMessageResponses(messages);

        String nextCursor = messages.size() < sanitizedLimit ? null : toCursor(
                messages.get(messages.size() - 1).getCreatedAt(),
                messages.get(messages.size() - 1).getId()
        );

        return DmCursorPageResponse.<DmMessageResponse>builder()
                .items(items)
                .nextCursor(nextCursor)
                .build();
    }

    @Override
    public DmMessageResponse sendMessage(Long threadId, DmMessageSendRequest request) {
        DmThread thread = getThreadWithAccess(threadId, request.getSenderUserId());

        MessageType messageType = request.getCardPayloadJson() == null ? MessageType.TEXT : MessageType.CARD;
        DmMessage saved = dmMessageRepository.save(DmMessage.builder()
                .thread(thread)
                .sender(getUser(request.getSenderUserId()))
                .messageType(messageType)
                .contentText(request.getContentText())
                .cardPayloadJson(request.getCardPayloadJson())
                .deliveredAt(LocalDateTime.now())
                .build());

        thread.setUpdatedAt(LocalDateTime.now());
        dmThreadRepository.save(thread);

        DmMessageResponse response = toMessageResponse(saved);
        broadcastThreadMessage(thread.getId(), response);
        return response;
    }

    @Override
    public DmMessageResponse reactMessage(Long messageId, DmReactionRequest request) {
        DmMessage message = dmMessageRepository.findById(messageId)
                .orElseThrow(() -> new AppException(ErrorCode.DM_MESSAGE_NOT_FOUND));

        validateThreadAccess(message.getThread(), request.getUserId());

        message.setCardPayloadJson(applyReactionToPayload(message.getCardPayloadJson(), request.getUserId(), request.getReaction()));
        DmMessage saved = dmMessageRepository.save(message);

        DmMessageResponse response = toMessageResponse(saved);
        broadcastThreadMessage(saved.getThread().getId(), response);
        return response;
    }

    @Override
    public DmMessageResponse replyMessage(Long messageId, DmReplyRequest request) {
        DmMessage parent = dmMessageRepository.findById(messageId)
                .orElseThrow(() -> new AppException(ErrorCode.DM_MESSAGE_NOT_FOUND));

        DmThread thread = getThreadWithAccess(parent.getThread().getId(), request.getSenderUserId());
        MessageType messageType = request.getCardPayloadJson() == null ? MessageType.TEXT : MessageType.CARD;

        DmMessage saved = dmMessageRepository.save(DmMessage.builder()
                .thread(thread)
                .sender(getUser(request.getSenderUserId()))
                .messageType(messageType)
                .contentText(request.getContentText())
                .cardPayloadJson(request.getCardPayloadJson())
                .replyToMessage(parent)
                .deliveredAt(LocalDateTime.now())
                .build());

        thread.setUpdatedAt(LocalDateTime.now());
        dmThreadRepository.save(thread);

        DmMessageResponse response = toMessageResponse(saved);
        broadcastThreadMessage(thread.getId(), response);
        return response;
    }

    @Override
    public void deleteMessage(Long messageId, Long userId, String mode) {
        DmMessage message = dmMessageRepository.findById(messageId)
                .orElseThrow(() -> new AppException(ErrorCode.DM_MESSAGE_NOT_FOUND));

        DmThread thread = message.getThread();
        validateThreadAccess(thread, userId);

        if (!MODE_FOR_ME.equals(mode) && !MODE_FOR_EVERYONE.equals(mode)) {
            throw new AppException(ErrorCode.INVALID_DELETE_MODE);
        }

        if (MODE_FOR_EVERYONE.equals(mode)) {
            if (!Objects.equals(message.getSender().getId(), userId)) {
                throw new AppException(ErrorCode.DM_DELETE_FORBIDDEN);
            }
            message.setDeletedForEveryone(true);
            dmMessageRepository.save(message);
            
            DmMessageResponse deleteEvent = DmMessageResponse.builder()
                    .messageId(message.getId())
                    .threadId(thread.getId())
                    .messageType(MessageType.DELETED.name())
                    .build();
            broadcastThreadMessage(thread.getId(), deleteEvent);
            return;
        }

        if (Objects.equals(message.getSender().getId(), userId)) {
            message.setDeletedForSender(true);
        } else {
            message.setDeletedForReceiver(true);
        }
        dmMessageRepository.save(message);
    }

    @Override
    public DmMessageResponse shareToThread(Long threadId, DmShareRequest request) {
        DmThread thread = getThreadWithAccess(threadId, request.getSenderUserId());

        String payload;
        try {
            payload = objectMapper.writeValueAsString(Map.of(
                    "shareType", request.getShareType(),
                    "shareRef", request.getShareRef(),
                    "note", request.getNote()
            ));
        } catch (JsonProcessingException e) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }

        DmMessage saved = dmMessageRepository.save(DmMessage.builder()
                .thread(thread)
                .sender(getUser(request.getSenderUserId()))
                .messageType(MessageType.CARD)
                .contentText(request.getNote())
                .cardPayloadJson(payload)
                .deliveredAt(LocalDateTime.now())
                .build());

        thread.setUpdatedAt(LocalDateTime.now());
        dmThreadRepository.save(thread);

        DmMessageResponse response = toMessageResponse(saved);
        broadcastThreadMessage(thread.getId(), response);
        return response;
    }

    private DmThread getThreadWithAccess(Long threadId, Long userId) {
        DmThread thread = dmThreadRepository.findById(threadId)
                .orElseThrow(() -> new AppException(ErrorCode.DM_THREAD_NOT_FOUND));
        validateThreadAccess(thread, userId);
        return thread;
    }

    private void validateThreadAccess(DmThread thread, Long userId) {
        boolean hasAccess = Objects.equals(thread.getUser1().getId(), userId)
                || Objects.equals(thread.getUser2().getId(), userId);
        if (!hasAccess) {
            throw new AppException(ErrorCode.DM_THREAD_ACCESS_DENIED);
        }
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private DmThreadResponse toThreadResponse(DmThread thread, Long requesterId) {
        User peer = Objects.equals(thread.getUser1().getId(), requesterId) ? thread.getUser2() : thread.getUser1();
        UserProfile profile = userProfileRepository.findById(peer.getId()).orElse(null);

        List<DmMessage> messages = dmMessageRepository.findVisibleMessagesWithCursor(
                thread.getId(), requesterId, null, null, PageRequest.of(0, 1)
        );
        String preview = null;
        if (!messages.isEmpty()) {
            DmMessage lastMsg = messages.get(0);
            preview = lastMsg.getDeletedForEveryone() ? "Tin nhắn đã bị thu hồi" : lastMsg.getContentText();
        }

        return DmThreadResponse.builder()
                .threadId(thread.getId())
                .peerUserId(peer.getId())
                .peerDisplayName(peer.getDisplayName())
                .peerAvatarUrl(profile != null ? profile.getAvatarUrl() : null)
                .lastMessagePreview(preview)
                .updatedAt(thread.getUpdatedAt())
                .build();
    }

    private List<DmMessageResponse> toMessageResponses(List<DmMessage> messages) {
        if (messages.isEmpty()) {
            return List.of();
        }

        List<Long> senderIds = messages.stream().map(m -> m.getSender().getId()).distinct().toList();
        Map<Long, UserProfile> profileByUserId = StreamSupport.stream(userProfileRepository.findAllById(senderIds).spliterator(), false)
                .collect(Collectors.toMap(UserProfile::getUserId, Function.identity()));

        return messages.stream()
                .map(message -> {
                    UserProfile profile = profileByUserId.get(message.getSender().getId());
                    return DmMessageResponse.builder()
                            .messageId(message.getId())
                            .threadId(message.getThread().getId())
                            .senderUserId(message.getSender().getId())
                            .senderDisplayName(message.getSender().getDisplayName())
                            .senderAvatarUrl(profile != null ? profile.getAvatarUrl() : null)
                            .messageType(message.getDeletedForEveryone() ? MessageType.DELETED.name() : message.getMessageType().name())
                            .contentText(message.getDeletedForEveryone() ? null : message.getContentText())
                            .cardPayloadJson(message.getDeletedForEveryone() ? null : message.getCardPayloadJson())
                            .replyToMessageId(message.getReplyToMessage() != null ? message.getReplyToMessage().getId() : null)
                            .createdAt(message.getCreatedAt())
                            .reactions(message.getDeletedForEveryone() ? Map.of() : extractReactionSummary(message.getCardPayloadJson()))
                            .build();
                })
                .toList();
    }

    private DmMessageResponse toMessageResponse(DmMessage message) {
        UserProfile profile = userProfileRepository.findById(message.getSender().getId()).orElse(null);
        return DmMessageResponse.builder()
                .messageId(message.getId())
                .threadId(message.getThread().getId())
                .senderUserId(message.getSender().getId())
                .senderDisplayName(message.getSender().getDisplayName())
                .senderAvatarUrl(profile != null ? profile.getAvatarUrl() : null)
                .messageType(message.getDeletedForEveryone() ? MessageType.DELETED.name() : message.getMessageType().name())
                .contentText(message.getDeletedForEveryone() ? null : message.getContentText())
                .cardPayloadJson(message.getDeletedForEveryone() ? null : message.getCardPayloadJson())
                .replyToMessageId(message.getReplyToMessage() != null ? message.getReplyToMessage().getId() : null)
                .createdAt(message.getCreatedAt())
                .reactions(message.getDeletedForEveryone() ? Map.of() : extractReactionSummary(message.getCardPayloadJson()))
                .build();
    }

    private Map<String, Long> extractReactionSummary(String cardPayloadJson) {
        if (cardPayloadJson == null || cardPayloadJson.isBlank()) {
            return Map.of();
        }

        try {
            JsonNode root = objectMapper.readTree(cardPayloadJson);
            JsonNode reactionsByUser = root.get(REACTIONS_BY_USER);
            if (reactionsByUser == null || !reactionsByUser.isObject()) {
                return Map.of();
            }

            Map<String, Long> summary = new HashMap<>();
            reactionsByUser.fields().forEachRemaining(entry -> {
                String reaction = entry.getValue().asText(null);
                if (reaction != null && !reaction.isBlank()) {
                    summary.merge(reaction, 1L, Long::sum);
                }
            });
            return summary;
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String applyReactionToPayload(String cardPayloadJson, Long userId, String reaction) {
        try {
            ObjectNode root;
            if (cardPayloadJson == null || cardPayloadJson.isBlank()) {
                root = objectMapper.createObjectNode();
            } else {
                JsonNode parsed = objectMapper.readTree(cardPayloadJson);
                root = parsed.isObject() ? (ObjectNode) parsed : objectMapper.createObjectNode();
            }

            ObjectNode reactionsByUser;
            JsonNode existing = root.get(REACTIONS_BY_USER);
            if (existing != null && existing.isObject()) {
                reactionsByUser = (ObjectNode) existing;
            } else {
                reactionsByUser = objectMapper.createObjectNode();
                root.set(REACTIONS_BY_USER, reactionsByUser);
            }

            reactionsByUser.put(String.valueOf(userId), reaction);
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            throw new AppException(ErrorCode.INVALID_REQUEST);
        }
    }

    private void broadcastThreadMessage(Long threadId, DmMessageResponse response) {
        messagingTemplate.convertAndSend("/topic/dm/threads/" + threadId + "/messages", response);
    }

    private CursorPayload parseCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return new CursorPayload(null, null);
        }

        String[] parts = cursor.split("\\|", 2);
        if (parts.length != 2) {
            throw new AppException(ErrorCode.INVALID_CURSOR);
        }

        try {
            return new CursorPayload(LocalDateTime.parse(parts[0]), Long.parseLong(parts[1]));
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_CURSOR);
        }
    }

    private String toCursor(LocalDateTime createdAt, Long id) {
        return createdAt + "|" + id;
    }

    private record CursorPayload(LocalDateTime createdAt, Long id) {
    }
}
