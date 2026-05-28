import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import ChatList from '../components/chat/ChatList';
import ChatWindow from '../components/chat/ChatWindow';
import { getCurrentUser } from '../services/auth';
import { getAllDmMessages, getDmThreads, sendDmMessage, deleteDmMessage } from '../services/dm';
import { disconnectRealtime, subscribeTopic } from '../lib/realtime';

const AVATAR_CLASSES = [
  'bg-orange-500',
  'bg-indigo-500',
  'bg-purple-600',
  'bg-pink-500',
  'bg-emerald-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-rose-500',
];

const formatTimeLabel = (value) => {
  if (!value) return 'Mới đây';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Mới đây';

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getAvatarClass = (seed) => AVATAR_CLASSES[Math.abs(Number(seed) || 0) % AVATAR_CLASSES.length];

const summarizeCardPayload = (payload) => {
  if (!payload) return '';

  try {
    const parsed = JSON.parse(payload);
    if (parsed?.note) return parsed.note;
    if (parsed?.shareType && parsed?.shareRef) {
      return `${parsed.shareType}: ${parsed.shareRef}`;
    }
  } catch {
    return payload;
  }

  return payload;
};

const Chat = () => {
  const { t } = useLanguage();
  const currentUser = getCurrentUser();
  const location = useLocation();
  const requestedThreadId = new URLSearchParams(location.search).get('threadId');
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const activeData = useMemo(
    () => chats.find((chat) => chat.id === activeChat) || null,
    [chats, activeChat]
  );

  useEffect(() => {
    let cancelled = false;

    const loadThreads = async () => {
      if (!currentUser?.id) {
        setChats([]);
        setIsLoadingThreads(false);
        return;
      }

      try {
        setIsLoadingThreads(true);
        const response = await getDmThreads(currentUser.id);
        const items = response?.data?.items || [];
        const mapped = items.map((thread, index) => ({
          id: thread.threadId,
          userId: thread.peerUserId,
          name: thread.peerDisplayName || `Người dùng ${thread.peerUserId}`,
          type: 'direct',
          avatar: getAvatarClass(thread.peerUserId ?? index),
          unread: 0,
          lastMsg: thread.lastMessagePreview || 'Chưa có tin nhắn',
          time: formatTimeLabel(thread.updatedAt),
          isLive: false,
          avatarUrl: thread.peerAvatarUrl,
        }));

        if (cancelled) return;

        setChats(mapped);
        const requestedId = requestedThreadId ? Number(requestedThreadId) : null;
        const requestedExists = requestedId && mapped.some((thread) => thread.id === requestedId);
        setActiveChat((current) => requestedExists ? requestedId : (current ?? mapped[0]?.id ?? null));
      } catch {
        if (!cancelled) {
          setChats([]);
          setActiveChat(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingThreads(false);
        }
      }
    };

    loadThreads();

    return () => {
      cancelled = true;
      disconnectRealtime();
    };
  }, [currentUser?.id, requestedThreadId]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    const loadMessages = async () => {
      if (!currentUser?.id || !activeChat) {
        setMessages([]);
        return;
      }

      try {
        setIsLoadingMessages(true);
        const items = await getAllDmMessages(activeChat, currentUser.id);

        if (cancelled) return;

        setMessages(items.map((message) => ({
          id: message.messageId,
          user: message.senderDisplayName || `Người dùng ${message.senderUserId}`,
          isMe: message.senderUserId === currentUser.id,
          userId: message.senderUserId,
          text: message.contentText || summarizeCardPayload(message.cardPayloadJson),
          time: formatTimeLabel(message.createdAt),
          avatar: getAvatarClass(message.senderUserId),
          avatarUrl: message.senderAvatarUrl,
          messageType: message.messageType,
          cardPayloadJson: message.cardPayloadJson,
          replyToMessageId: message.replyToMessageId,
        })));

        unsubscribe = await subscribeTopic(`/topic/dm/threads/${activeChat}/messages`, (incoming) => {
          if (incoming?.threadId !== activeChat) {
            return;
          }

          if (incoming.messageType === 'DELETED') {
            setMessages((prev) => prev.map((m) => m.id === incoming.messageId ? { ...m, messageType: 'DELETED', text: null, cardPayloadJson: null, media: null } : m));
            setChats((prev) => prev.map((chat) => (
              chat.id === activeChat
                ? {
                    ...chat,
                    lastMsg: 'Tin nhắn đã bị thu hồi',
                  }
                : chat
            )));
            return;
          }

          setMessages((prev) => [...prev, {
            id: incoming.messageId,
            user: incoming.senderDisplayName || `Người dùng ${incoming.senderUserId}`,
            isMe: incoming.senderUserId === currentUser.id,
            userId: incoming.senderUserId,
            text: incoming.contentText || summarizeCardPayload(incoming.cardPayloadJson),
            time: formatTimeLabel(incoming.createdAt),
            avatar: getAvatarClass(incoming.senderUserId),
            avatarUrl: incoming.senderAvatarUrl,
            messageType: incoming.messageType,
            cardPayloadJson: incoming.cardPayloadJson,
            replyToMessageId: incoming.replyToMessageId,
          }]);

          setChats((prev) => prev.map((chat) => (
            chat.id === activeChat
              ? {
                  ...chat,
                  lastMsg: incoming.contentText || summarizeCardPayload(incoming.cardPayloadJson) || chat.lastMsg,
                  time: formatTimeLabel(incoming.createdAt),
                }
              : chat
          )));
        });
      } catch {
        if (!cancelled) {
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMessages(false);
        }
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [activeChat, currentUser?.id]);

  const handleSendMessage = async () => {
    const contentText = draftMessage.trim();
    if (!contentText || !activeChat || !currentUser?.id) {
      return;
    }

    try {
      setIsSending(true);
      await sendDmMessage(activeChat, {
        senderUserId: currentUser.id,
        contentText,
        cardPayloadJson: null,
      });
      setDraftMessage('');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (messageId, mode) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await deleteDmMessage(messageId, mode, currentUser.id);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  if (!currentUser?.id) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center rounded-2xl border border-gray-200 dark:border-gray-800 bg-surface-color text-text-muted">
        Bạn cần đăng nhập để xem tin nhắn.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-surface-color rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">

      <ChatList
        t={t}
        chats={isLoadingThreads && chats.length === 0 ? [] : chats}
        activeChat={activeChat}
        setActiveChat={setActiveChat}
      />

      <ChatWindow
        t={t}
        activeData={activeData}
        messages={messages}
        playingId={playingId}
        setPlayingId={setPlayingId}
        draftMessage={draftMessage}
        setDraftMessage={setDraftMessage}
        onSendMessage={handleSendMessage}
        onDeleteMessage={handleDeleteMessage}
        isSending={isSending}
        isLoadingMessages={isLoadingMessages}
      />

    </div>
  );
};

export default Chat;
