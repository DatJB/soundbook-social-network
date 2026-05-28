import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Pause, SkipForward, SkipBack, Volume2, Maximize2, Users, MessageSquare, Heart, Settings, Plus, List, MoreHorizontal } from 'lucide-react';
import RoomHeader from '../components/livesync/RoomHeader';
import VisualizerCover from '../components/livesync/VisualizerCover';
import TransportControls from '../components/livesync/TransportControls';
import RoomChat from '../components/livesync/RoomChat';
import RoomQueue from '../components/livesync/RoomQueue';
import RoomMembers from '../components/livesync/RoomMembers';
import YouTubePlayer from '../components/livesync/YouTubePlayer';
import { useLanguage } from '../context/LanguageContext';
import { getCurrentUser } from '../services/auth';
import { getRoomDetail, getRoomQueue, joinRoom, leaveRoom } from '../services/room';
import { publishMessage } from '../lib/realtime';
import { useRoomSession } from '../context/RoomSessionContext';
import { useToast } from '../context/ToastContext';

const LiveSyncRoom = () => {
  const { id: roomIdParam } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const currentUser = getCurrentUser();
  const [roomId, setRoomId] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [activeRightPanel, setActiveRightPanel] = useState('chat');
  const [room, setRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [volume, setVolume] = useState(100);
  const [controlsVisible, setControlsVisible] = useState(true);
  const { showToast } = useToast();
  
  const lastSyncRef = useRef(Date.now());
  const prevPendingLengthRef = useRef(0);
  const { session, joinSession, leaveSession, updateMembers, setLocalPlayback } = useRoomSession();

  // Derive live state from global session — no stale closure, no double-subscription
  const queue = session?.queue || [];
  const members = session?.members || [];
  const pendingMembers = session?.pendingMembers || [];
  const chatMessages = session?.chatMessages || [];
  const playbackState = session?.playback ? {
    trackId: session.playback.trackId,
    trackPayloadJson: null,
    positionMs: session.playback.positionMs,
    isPlaying: session.playback.isPlaying,
    updatedAt: session.playback.updatedAt,
    localReceivedAt: session.playback.localReceivedAt,
  } : null;
  const isPlaying = session?.playback?.isPlaying || false;

  const isHost = currentUser?.id === room?.hostUserId;
  const isPending = session?.pendingMembers?.some(m => m.userId === currentUser?.id) || false;
  const isActiveMember = session?.members?.some(m => m.userId === currentUser?.id) || false;
  // Ensure session is loaded before evaluating isGhost to avoid kicking during initial load
  const isGhost = !!session && !isHost && !isActiveMember && !isPending && room;

  const syncRoomDetail = async (targetRoomId) => {
    const roomResponse = await getRoomDetail(targetRoomId);
    const roomData = roomResponse?.data;

    if (!roomData) return null;

    setRoom(roomData);
    updateMembers(roomData.members || [], roomData.pendingMembers || []);

    return roomData;
  };

  const isAlreadyJoinedError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('already') && message.includes('join');
  };

  // Load room details on mount
  useEffect(() => {
    let active = true;
    let memberPollTimer = null;
    const unsubscribers = [];

    const initRoom = async () => {
      try {
        if (!roomIdParam) {
          setIsLoading(false);
          return;
        }

        const parsedRoomId = parseInt(roomIdParam);
        setRoomId(parsedRoomId);

        // Step 1: fetch room details (check status)
        const initialData = await syncRoomDetail(parsedRoomId);

        if (initialData && (initialData.status === 'LIVE' || initialData.hostUserId === currentUser.id)) {
          const isActiveMember = initialData.members?.some(m => m.userId === currentUser.id);
          if (!isActiveMember) {
            try {
              await joinRoom(parsedRoomId, currentUser.id);
            } catch (joinError) {
              if (!isAlreadyJoinedError(joinError)) throw joinError;
            }
          }
        } else if (!initialData) {
          // no data — fall through to mock below
        } else {
          throw new Error('Cannot join room because it is not active');
        }

        if (!active) return;

        // Step 2: re-fetch AFTER joining so current user appears in members
        const freshData = await syncRoomDetail(parsedRoomId);
        const roomData = freshData || initialData;

        if (!roomData) {
          // Minimal mock so UI can render
          const mockRoom = {
            roomId: parsedRoomId,
            name: `Room ${parsedRoomId}`,
            isPublic: true,
            status: 'LIVE',
            hostUserId: currentUser?.id,
            state: null,
            members: [{ userId: currentUser?.id, displayName: currentUser?.displayName || 'You', role: 'HOST' }],
          };
          setRoom(mockRoom);
          await joinSession({ roomId: parsedRoomId, roomData: mockRoom, queue: [], currentUserId: currentUser?.id });
          setIsLoading(false);
          return;
        }

        setRoom(roomData);

        // Step 3: fetch queue
        const queueResponse = await getRoomQueue(parsedRoomId);
        const fetchedQueue = queueResponse?.data || [];

        // Step 4: initialize global session (one STOMP subscription for everything)
        await joinSession({
          roomId: parsedRoomId,
          roomData,
          queue: fetchedQueue,
          currentUserId: currentUser?.id,
        });

        // Step 5: poll members every 5s
        memberPollTimer = setInterval(() => {
          syncRoomDetail(parsedRoomId).catch(() => {});
        }, 5000);

      } catch (error) {
        console.error('Error loading room:', error);
        const parsedRoomId = parseInt(roomIdParam);
        const mockRoom = {
          roomId: parsedRoomId, name: `Room ${parsedRoomId}`, status: 'LIVE',
          hostUserId: currentUser?.id, state: null,
          members: [{ userId: currentUser?.id, displayName: currentUser?.displayName || 'You', role: 'HOST' }],
        };
        setRoom(mockRoom);
        try {
          await joinSession({ roomId: parsedRoomId, roomData: mockRoom, queue: [], currentUserId: currentUser?.id });
        } catch (_) {}
      } finally {
        if (active) setIsLoading(false);
      }
    };

    if (currentUser?.id && roomIdParam) {
      initRoom();
    }

    return () => {
      active = false;

      if (memberPollTimer) {
        clearInterval(memberPollTimer);
      }

      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {
          console.error('Unsubscribe error:', error);
        }
      });

      const parsedRoomId = parseInt(roomIdParam);
      if (currentUser?.id && Number.isFinite(parsedRoomId)) {
        // Tell context we left the page — subscriptions stay alive for MiniPlayer
        leaveSession();
        leaveRoom(parsedRoomId, currentUser.id).catch(() => {});
      }
    };
  }, [currentUser?.id, roomIdParam]);

  // Push playback snapshot into local state only (context owns STOMP subscription)
  useEffect(() => {
    if (!room || !playbackState) return;
    // Context already receives STOMP updates — just keep local UI state in sync
  }, [playbackState, room, queue]);

  // Handle room end or kick signal
  useEffect(() => {
    if (session?.ended && roomIdParam) {
      showToast('Phòng đã kết thúc bởi quản trị viên hoặc chủ phòng.', 'info');
      navigate('/feed', { replace: true });
    } else if (session?.kicked && roomIdParam) {
      const reasonMap = {
        'KICKED': 'Bạn đã bị chủ phòng mời ra khỏi phòng.',
        'BANNED': 'Bạn đã bị cấm tham gia phòng này.',
        'REJECTED': 'Yêu cầu tham gia phòng của bạn đã bị từ chối.'
      };
      showToast(reasonMap[session.kickReason] || 'Bạn đã rời phòng.', 'warning');
      navigate('/feed', { replace: true });
    } else if (isGhost && roomIdParam) {
      // If user is not host, not in members, and not in pendingMembers -> they have been removed!
      showToast('Bạn không có trong danh sách phòng hoặc đã bị mời ra.', 'warning');
      navigate('/feed', { replace: true });
    }
  }, [session?.ended, session?.kicked, session?.kickReason, isGhost, roomIdParam, navigate, showToast]);

  // Notify host of new pending members
  useEffect(() => {
    if (isHost && pendingMembers.length > prevPendingLengthRef.current) {
      showToast('Có người đang xin vào phòng!', 'info');
    }
    prevPendingLengthRef.current = pendingMembers.length;
  }, [pendingMembers.length, isHost, showToast]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !roomId || !currentUser?.id || isSendingMessage) return;

    try {
      setIsSendingMessage(true);
      await publishMessage(`/app/rooms/${roomId}/messages`, {
        senderUserId: currentUser.id,
        contentText: chatInput,
      });
      setChatInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleTogglePlay = async (forcedState = null) => {
    if (!roomId || !currentUser?.id || !playbackState || !isHost) return;

    try {
      const newState = forcedState !== null ? forcedState : !isPlaying;
      if (newState === isPlaying) return;
      
      setLocalPlayback({ isPlaying: newState });
      lastSyncRef.current = Date.now();
      
      await publishMessage(`/app/rooms/${roomId}/playback`, {
        updatedByUserId: currentUser.id,
        trackId: playbackState.trackId || (queue.length > 0 ? queue[0].trackId : null),
        trackPayloadJson: playbackState.trackPayloadJson || (queue.length > 0 ? queue[0].trackPayloadJson : null),
        positionMs: playbackState.positionMs,
        isPlaying: newState,
      });
    } catch (error) {
      console.error('Error updating playback:', error);
    }
  };

  const handleSeekUpdate = (timeSeconds) => {
    if (!isHost || !playbackState) return;
    
    // Keep local playback in sync so pause/resume uses the latest position.
    setLocalPlayback({ positionMs: timeSeconds * 1000 });
    
    // Host sẽ tự động đồng bộ vị trí của mình với cả phòng mỗi 5 giây để tránh sai lệch
    if (isPlaying) {
      const now = Date.now();
      if (now - lastSyncRef.current > 5000) {
        lastSyncRef.current = now;
        publishMessage(`/app/rooms/${roomId}/playback`, {
          updatedByUserId: currentUser.id,
          trackId: playbackState.trackId || (queue.length > 0 ? queue[0].trackId : null),
          trackPayloadJson: playbackState.trackPayloadJson || (queue.length > 0 ? queue[0].trackPayloadJson : null),
          positionMs: timeSeconds * 1000,
          isPlaying: true,
        }).catch(console.error);
      }
    }
  };

  const handleExplicitSeek = async (timeSeconds) => {
    if (!isHost || !roomId || !playbackState) return;
    
    try {
      lastSyncRef.current = Date.now();
      await publishMessage(`/app/rooms/${roomId}/playback`, {
        updatedByUserId: currentUser.id,
        trackId: playbackState.trackId || (queue.length > 0 ? queue[0].trackId : null),
        trackPayloadJson: playbackState.trackPayloadJson || (queue.length > 0 ? queue[0].trackPayloadJson : null),
        positionMs: timeSeconds * 1000,
        isPlaying: isPlaying,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleEnded = async () => {
    if (!isHost || !roomId) return;
    
    // Nếu có bài trong hàng đợi, tự động xoá bài hiện tại (bài index 0)
    if (queue.length > 0) {
      handleRemoveQueueItem(queue[0].id);
    }

    if (queue.length > 1) {
      const nextSong = queue[1];
      
      await publishMessage(`/app/rooms/${roomId}/playback`, {
        updatedByUserId: currentUser.id,
        trackId: nextSong.trackId,
        trackPayloadJson: nextSong.trackPayloadJson,
        positionMs: 0,
        isPlaying: true,
      });
    } else {
      // Nothing next, just stop
      setLocalPlayback({ isPlaying: false, positionMs: 0 });
      await publishMessage(`/app/rooms/${roomId}/playback`, {
        updatedByUserId: currentUser.id,
        trackId: playbackState.trackId,
        trackPayloadJson: playbackState.trackPayloadJson,
        positionMs: 0,
        isPlaying: false,
      });
    }
  };

  const handleAddToQueue = async (trackId, trackPayloadJson) => {
    if (!roomId || !currentUser?.id) return;

    try {
      await publishMessage(`/app/rooms/${roomId}/queue`, {
        trackId,
        trackPayloadJson,
        addedByUserId: currentUser.id,
      });
    } catch (error) {
      console.error('Error adding to queue:', error);
    }
  };

  const handleVoteQueueItem = async (queueItemId) => {
    if (!roomId) return;

    try {
      await publishMessage(`/app/rooms/${roomId}/queue/${queueItemId}/vote`, {});
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  const handleRemoveQueueItem = async (queueItemId) => {
    if (!roomId || !isHost) return;

    try {
      await publishMessage(`/app/rooms/${roomId}/queue/${queueItemId}/remove`, {});
    } catch (error) {
      console.error('Error removing from queue:', error);
    }
  };

  if (isLoading) {
    return <div className="flex h-[calc(100vh-8rem)] items-center justify-center">Loading room...</div>;
  }

  if (!room) {
    return <div className="flex h-[calc(100vh-8rem)] items-center justify-center">Room not found</div>;
  }

  if (isPending) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)] items-center justify-center bg-surface-color rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-8 text-center animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-500 mb-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
        </div>
        <h2 className="text-2xl font-bold mb-2">Đang chờ chủ phòng duyệt</h2>
        <p className="text-text-muted max-w-md">
          Phòng này là phòng riêng tư. Bạn cần đợi chủ phòng ({room.hostDisplayName}) đồng ý để có thể vào trong.
        </p>
        <button 
          onClick={() => navigate('/feed', { replace: true })}
          className="mt-8 px-6 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Quay lại trang chủ
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">

      {/* Media Player */}
      <div className="flex-1 lg:w-[65%] flex flex-col gap-6 h-full">

        {/* Main */}
        <div 
          className="flex-1 bg-black rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden relative group"
          onMouseMove={() => {
             if (window.uiTimeout) clearTimeout(window.uiTimeout);
             setControlsVisible(true);
             window.uiTimeout = setTimeout(() => setControlsVisible(false), 3000);
          }}
          onMouseLeave={() => {
             if (window.uiTimeout) clearTimeout(window.uiTimeout);
             setControlsVisible(false);
          }}
        >
          <RoomHeader
            membersCount={members.length}
            roomName={room?.name}
            roomId={room?.roomId || roomId}
            visible={controlsVisible}
          />

          <div className="w-full h-full">
            <YouTubePlayer
              videoId={playbackState?.trackId || (queue.length > 0 ? queue[0].trackId : null)}
              isPlaying={isPlaying}
              playbackState={playbackState}
              isHost={isHost}
              onPlaybackStateChange={(playing) => {
                handleTogglePlay(playing);
              }}
              onCurrentTimeChange={handleSeekUpdate}
              onSeek={handleExplicitSeek}
              onEnded={handleEnded}
              onSkip={handleEnded}
              volume={volume}
              onVolumeChange={setVolume}
              onAddSongRequest={() => setActiveRightPanel('queue')}
              forceShowControls={controlsVisible}
            />
          </div>
        </div>

        {/* Queue Preview */}
        <div className="hidden lg:flex items-center justify-between bg-surface-color rounded-xl p-3 border border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {queue.length > 0 && (() => {
              const payload = queue[0].trackPayloadJson ? JSON.parse(queue[0].trackPayloadJson) : null;
              return (
                <>
                  <div className="w-10 h-10 rounded-md bg-black overflow-hidden flex-shrink-0">
                    {payload?.thumbnail ? (
                      <img src={payload.thumbnail} alt={payload.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-red-500 to-black" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-text-muted font-bold uppercase tracking-wider mb-0.5">{t('room.up_next')}</p>
                    <p className="text-sm font-bold truncate" title={payload?.title || queue[0].trackId}>
                      {payload?.title || queue[0].trackId}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
          <button
            onClick={() => setActiveRightPanel('queue')}
            className="text-xs font-semibold px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {t('room.view_queue')}
          </button>
        </div>

      </div>

      <div className="flex-1 lg:w-[35%] bg-surface-color rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col h-full overflow-hidden">

        {/* Panel */}
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveRightPanel('chat')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeRightPanel === 'chat' ? 'text-primary-500 border-b-2 border-primary-500 bg-primary-500/5' : 'text-text-muted hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
          >
            <MessageSquare size={16} /> {t('room.chat')}
          </button>
          <button
            onClick={() => setActiveRightPanel('queue')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeRightPanel === 'queue' ? 'text-primary-500 border-b-2 border-primary-500 bg-primary-500/5' : 'text-text-muted hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
          >
            <List size={16} /> {t('room.queue')}
          </button>
          <button
            onClick={() => setActiveRightPanel('members')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors relative ${activeRightPanel === 'members' ? 'text-primary-500 border-b-2 border-primary-500 bg-primary-500/5' : 'text-text-muted hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
          >
            <Users size={16} /> {members.length}
            {isHost && pendingMembers.length > 0 && (
              <span className="absolute top-2 right-4 w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </button>
        </div>

        {/* Panel Content */}
        {activeRightPanel === 'chat' && (
          <RoomChat
            chatMessages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendMessage={handleSendMessage}
            isSending={isSendingMessage}
          />
        )}
        {activeRightPanel === 'queue' && (
          <RoomQueue
            queue={queue}
            onVote={handleVoteQueueItem}
            onAddSong={handleAddToQueue}
            onRemove={handleRemoveQueueItem}
            isHost={isHost}
          />
        )}
        {activeRightPanel === 'members' && (
          <RoomMembers 
            members={members} 
            pendingMembers={session?.pendingMembers || []}
            isHost={isHost}
            roomId={roomId}
            hostUserId={currentUser?.id}
          />
        )}

      </div>
    </div>
  );
};

export default LiveSyncRoom;
