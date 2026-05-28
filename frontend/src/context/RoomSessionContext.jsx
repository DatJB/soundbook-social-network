/**
 * RoomSessionContext — Global Room State Manager
 *
 * ARCHITECTURE: One single source of truth for the active room session.
 * - One STOMP connection, one set of subscriptions, alive for the full app lifetime.
 * - Any page (LiveSyncRoom, Feed, Profile...) reads from this context.
 * - No "handoff" or "background mode" needed — subscriptions never restart.
 *
 * API:
 *   joinSession(roomId, roomData, queue, currentUserId) — called by LiveSyncRoom on mount
 *   leaveSession()                                       — called by LiveSyncRoom on unmount
 *   pushPlayback(message)                               — called by Host to broadcast
 *   pushQueueAdd(message)                               — called to add to queue
 *   removeQueueItem(roomId, itemId)                     — called to remove from queue
 *   session                                             — current room state (null = no active room)
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {
  subscribeTopic,
  ensureRealtimeConnected,
  publishMessage,
} from '../lib/realtime';

const RoomSessionContext = createContext(null);

export const RoomSessionProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  /*
   * session shape:
   * {
   *   roomId, roomName, hostUserId, currentUserId,
   *   isHost,
   *   playback: { trackId, trackTitle, trackThumbnail, isPlaying, positionMs, localReceivedAt, updatedAt },
   *   queue: [],
   *   members: [],
   *   pendingMembers: [],
   *   chatMessages: [],
   *   kicked: false,
   * }
   */

  // Refs for stable subscription teardown
  const unsubscribeAllRef = useRef(null);
  const activeRoomIdRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Internal helper: build playback object from a backend state DTO
  // ─────────────────────────────────────────────────────────────────────────────
  const buildPlayback = (state, queue) => {
    const queueItem = queue?.find(q => q.trackId === state?.trackId) || queue?.[0];
    let payload = null;
    try {
      payload = queueItem?.trackPayloadJson ? JSON.parse(queueItem.trackPayloadJson) : null;
    } catch (_) {}
    return {
      trackId: state?.trackId || null,
      trackTitle: payload?.title || null,
      trackThumbnail: payload?.thumbnail || null,
      isPlaying: state?.isPlaying || false,
      positionMs: state?.positionMs || 0,
      updatedAt: state?.updatedAt || null,
      localReceivedAt: Date.now(),
    };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // joinSession — called by LiveSyncRoom on mount
  // ─────────────────────────────────────────────────────────────────────────────
  const joinSession = useCallback(async ({ roomId, roomData, queue, currentUserId }) => {
    // If already subscribed to THIS room, just update state
    if (activeRoomIdRef.current === roomId) {
      setSession(prev => prev ? {
        ...prev,
        members: roomData.members || prev.members,
        pendingMembers: roomData.pendingMembers || prev.pendingMembers,
        queue: queue || prev.queue,
        kicked: false,
        kickReason: null,
      } : prev);
      return;
    }

    // Tear down previous subscription if switching rooms
    if (unsubscribeAllRef.current) {
      try { unsubscribeAllRef.current(); } catch (_) {}
      unsubscribeAllRef.current = null;
    }

    activeRoomIdRef.current = roomId;

    // Set initial session state immediately (before STOMP connects)
    const initialQueue = queue || [];
    setSession({
      roomId,
      roomName: roomData.name,
      hostUserId: roomData.hostUserId,
      currentUserId,
      isHost: roomData.hostUserId === currentUserId,
      playback: buildPlayback(roomData.state, initialQueue),
      queue: initialQueue,
      members: roomData.members || [],
      pendingMembers: roomData.pendingMembers || [],
      chatMessages: [],
    });

    // Subscribe to all STOMP topics for this room
    try {
      await ensureRealtimeConnected();

      const unsubPlayback = await subscribeTopic(
        `/topic/rooms/${roomId}/playback`,
        (state) => {
          setSession(prev => {
            if (!prev || prev.roomId !== roomId) return prev;
            return {
              ...prev,
              playback: buildPlayback(state, prev.queue),
            };
          });
        }
      );

      const unsubStatus = await subscribeTopic(
        `/topic/rooms/${roomId}/status`,
        (event) => {
          if (event?.status === 'ENDED') {
            // Keep session alive for MiniPlayer — just mark it ended
            setSession(prev => prev ? { ...prev, ended: true } : prev);
          } else if (event?.hostUserId) {
            // Update host when a new host is promoted
            setSession(prev => {
              if (!prev || prev.roomId !== roomId) return prev;
              return {
                ...prev,
                hostUserId: event.hostUserId,
                isHost: event.hostUserId === prev.currentUserId,
              };
            });
          }
        }
      );

      const unsubQueue = await subscribeTopic(
        `/topic/rooms/${roomId}/queue`,
        (newItem) => {
          setSession(prev => {
            if (!prev) return prev;
            return { ...prev, queue: [...prev.queue, newItem] };
          });
        }
      );

      const unsubQueueVotes = await subscribeTopic(
        `/topic/rooms/${roomId}/queue/votes`,
        (votedItem) => {
          setSession(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              queue: prev.queue.map(i => i.id === votedItem.id ? votedItem : i),
            };
          });
        }
      );

      const unsubQueueRemove = await subscribeTopic(
        `/topic/rooms/${roomId}/queue/remove`,
        (removedItemId) => {
          setSession(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              queue: prev.queue.filter(i => i.id !== removedItemId),
            };
          });
        }
      );

      const unsubMembers = await subscribeTopic(
        `/topic/rooms/${roomId}/members`,
        (updatedMembers) => {
          setSession(prev => {
            if (!prev || prev.roomId !== roomId) return prev;
            // Find the new host from the updated members list
            const newHostId = updatedMembers.find(m => m.role === 'HOST')?.userId;
            return {
              ...prev,
              members: updatedMembers,
              ...(newHostId && { 
                hostUserId: newHostId,
                isHost: newHostId === prev.currentUserId
              })
            };
          });
        }
      );

      const unsubMessages = await subscribeTopic(
        `/topic/rooms/${roomId}/messages`,
        (msg) => {
          setSession(prev => {
            if (!prev) return prev;
            if (prev.chatMessages.some(m => m.id === msg.messageId)) return prev;
            return {
              ...prev,
              chatMessages: [...prev.chatMessages, {
                id: msg.messageId,
                user: msg.senderDisplayName,
                avatar: msg.senderAvatarUrl,
                text: msg.contentText,
              }],
            };
          });
        }
      );

      const unsubPersonal = await subscribeTopic(
        `/topic/rooms/${roomId}/members/${currentUserId}`,
        (event) => {
          if (event?.action === 'KICKED' || event?.action === 'BANNED' || event?.action === 'REJECTED') {
            setSession(prev => prev ? { ...prev, kicked: true, kickReason: event.action } : prev);
          } else if (event?.action === 'APPROVED') {
             // Let the 5s polling pick it up, or set a flag to force UI reload
             setSession(prev => prev ? { ...prev, approved: true } : prev);
          }
        }
      );

      unsubscribeAllRef.current = () => {
        [unsubPlayback, unsubStatus, unsubQueue, unsubQueueVotes, unsubQueueRemove, unsubMembers, unsubMessages, unsubPersonal]
          .forEach(fn => { try { fn(); } catch (_) {} });
      };
    } catch (e) {
      console.error('[RoomSession] STOMP subscription failed', e);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // leaveSession — called by LiveSyncRoom on unmount
  // Does NOT tear down subscriptions — they stay alive for MiniPlayer!
  // ─────────────────────────────────────────────────────────────────────────────
  const leaveSession = useCallback(() => {
    // Intentionally do nothing to STOMP subs — they keep running for MiniPlayer.
    // The session stays alive.
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // closeSession — fully close (user clicks X on MiniPlayer or room ends)
  // ─────────────────────────────────────────────────────────────────────────────
  const closeSession = useCallback(() => {
    if (unsubscribeAllRef.current) {
      try { unsubscribeAllRef.current(); } catch (_) {}
      unsubscribeAllRef.current = null;
    }
    activeRoomIdRef.current = null;
    setSession(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // updateMembers — called by polling in LiveSyncRoom
  // ─────────────────────────────────────────────────────────────────────────────
  const updateMembers = useCallback((members, pendingMembers = [], hostUserId, currentUserId) => {
    setSession(prev => {
      if (!prev) return prev;
      // If hostUserId changed, update isHost flag
      if (hostUserId !== undefined && hostUserId !== prev.hostUserId) {
        return {
          ...prev,
          members,
          pendingMembers,
          hostUserId,
          isHost: hostUserId === currentUserId,
        };
      }
      return { ...prev, members, pendingMembers };
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // setLocalPlayback — optimistic update from Host actions (play/pause/seek)
  // ─────────────────────────────────────────────────────────────────────────────
  const setLocalPlayback = useCallback((patch) => {
    setSession(prev => {
      if (!prev) return prev;
      return { ...prev, playback: { ...prev.playback, ...patch } };
    });
  }, []);

  // Cleanup on app unmount
  useEffect(() => {
    return () => {
      if (unsubscribeAllRef.current) {
        try { unsubscribeAllRef.current(); } catch (_) {}
      }
    };
  }, []);

  return (
    <RoomSessionContext.Provider value={{
      session,
      joinSession,
      leaveSession,
      closeSession,
      updateMembers,
      setLocalPlayback,
    }}>
      {children}
    </RoomSessionContext.Provider>
  );
};

export const useRoomSession = () => {
  const ctx = useContext(RoomSessionContext);
  if (!ctx) throw new Error('useRoomSession must be used within RoomSessionProvider');
  return ctx;
};
