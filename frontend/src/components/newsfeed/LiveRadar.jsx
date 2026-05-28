import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { ArrowLeft, Disc3, Headphones, Keyboard, LogIn, Music, Plus, Radio, RefreshCw, Users, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom } from '../../services/room';
import { getCurrentUser } from '../../services/auth';

const safeParseTrack = (trackPayloadJson) => {
  if (!trackPayloadJson) return null;
  if (typeof trackPayloadJson === 'object') return trackPayloadJson;
  try {
    return JSON.parse(trackPayloadJson);
  } catch {
    return null;
  }
};

const getTrackText = (room) => {
  const track = safeParseTrack(room?.state?.trackPayloadJson);
  return track?.title || track?.name || room?.topic || 'Đang chờ bài hát';
};

const normalizeRoom = (room) => ({
  id: room?.roomId ?? room?.id,
  name: room?.name || 'Phòng live',
  topic: room?.topic || '',
  hostName: room?.hostDisplayName || 'Soundbook user',
  hostAvatarUrl: room?.hostAvatarUrl || '',
  listenersCount: Number(room?.listenersCount || 0),
  trackText: getTrackText(room),
  raw: room,
});

const RoomModal = ({ room, mode = 'menu', onClose, onCreated }) => {
  const { t } = useLanguage();
  const [view, setView] = useState(mode);
  const [code, setCode] = useState(room?.id ? String(room.id) : '');
  const [roomName, setRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [createdRoomId, setCreatedRoomId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const title = room?.name || 'Phòng live hát';

  const handleClose = () => {
    setView('menu');
    setCode('');
    setRoomName('');
    setCreatedRoomId(null);
    setIsSubmitting(false);
    setErrorMessage('');
    setCopyMessage('');
    onClose();
  };

  const parseRoomId = (rawValue) => {
    if (!rawValue) return null;
    const value = String(rawValue).trim();
    if (/^\d+$/.test(value)) return Number(value);
    const routeMatch = value.match(/\/room\/(\d+)/i);
    if (routeMatch?.[1]) return Number(routeMatch[1]);
    return null;
  };

  const goToRoom = (roomId) => {
    navigate(`/room/${roomId}`);
    handleClose();
  };

  const handleJoinRoom = async (targetRoomId = null) => {
    const parsedRoomId = targetRoomId || parseRoomId(code);
    if (!parsedRoomId || !currentUser?.id) {
      setErrorMessage('Mã phòng không hợp lệ. Vui lòng nhập số ID phòng hoặc link /room/{id}.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await joinRoom(parsedRoomId, currentUser.id);
      goToRoom(parsedRoomId);
    } catch (error) {
      const message = error?.message || '';
      if (message.toLowerCase().includes('already joined')) {
        goToRoom(parsedRoomId);
        return;
      }
      setErrorMessage(message || 'Không thể vào phòng. Vui lòng kiểm tra lại mã phòng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim() || !currentUser?.id) {
      setErrorMessage('Bạn cần nhập tên phòng và đăng nhập để tạo phòng.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const response = await createRoom(currentUser.id, roomName.trim(), `Hosted by ${currentUser.displayName || 'user'}`, isPublic);
      const newRoomId = response?.data?.roomId;

      if (!newRoomId) {
        throw new Error('Tạo phòng thành công nhưng chưa nhận được mã phòng.');
      }

      setCreatedRoomId(newRoomId);
      onCreated?.();
    } catch (error) {
      setErrorMessage(error?.message || 'Không thể tạo phòng lúc này.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyRoomId = async () => {
    if (!createdRoomId) return;
    try {
      await navigator.clipboard.writeText(String(createdRoomId));
      setCopyMessage('Đã copy mã phòng.');
    } catch {
      setCopyMessage(`Mã phòng: ${createdRoomId}`);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative p-5 pb-4 bg-gradient-to-br from-yellow-400 to-orange-500 flex flex-col items-center gap-2">
          {view !== 'menu' && (
            <button
              type="button"
              onClick={() => setView('menu')}
              className="absolute top-3 left-3 p-1.5 text-white/70 hover:text-white rounded-full hover:bg-white/20 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-3 right-3 p-1.5 text-white/70 hover:text-white rounded-full hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
            <Music size={26} className="text-white" />
          </div>
          <div className="text-center">
            <h2 className="font-bold text-white text-base">{title}</h2>
            <p className="text-white/75 text-xs mt-0.5">
              {view === 'menu' && 'Tạo hoặc tham gia phòng live hát'}
              {view === 'join' && t('room.join_room')}
              {view === 'open' && (createdRoomId ? 'Phòng đã tạo' : t('room.open_room'))}
            </p>
          </div>
        </div>

        {view === 'menu' && (
          <div className="p-4 space-y-3">
            {room?.id ? (
              <button
                type="button"
                onClick={() => handleJoinRoom(room.id)}
                disabled={isSubmitting}
                className="flex items-center gap-4 w-full p-4 rounded-xl border-2 border-primary-500/30 bg-primary-50 dark:bg-primary-500/10 hover:border-primary-500 hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-all group disabled:opacity-60"
              >
                <div className="w-11 h-11 rounded-full bg-primary-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <LogIn size={20} className="text-white" />
                </div>
                <div className="text-left min-w-0">
                  <p className="font-semibold text-sm text-text-color">Vào phòng này</p>
                  <p className="truncate text-xs text-text-muted mt-0.5">{room.trackText}</p>
                </div>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setView('join')}
              className="flex items-center gap-4 w-full p-4 rounded-xl border-2 border-primary-500/30 bg-primary-50 dark:bg-primary-500/10 hover:border-primary-500 hover:bg-primary-100 dark:hover:bg-primary-500/20 transition-all group"
            >
              <div className="w-11 h-11 rounded-full bg-primary-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Keyboard size={20} className="text-white" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm text-text-color">Nhập mã phòng</p>
                <p className="text-xs text-text-muted mt-0.5">Dán mã hoặc đường dẫn phòng bạn được mời</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setView('open')}
              className="flex items-center gap-4 w-full p-4 rounded-xl border-2 border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 hover:border-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all group"
            >
              <div className="w-11 h-11 rounded-full bg-rose-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Radio size={20} className="text-white" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm text-text-color">Tạo phòng live hát</p>
                <p className="text-xs text-text-muted mt-0.5">Mở phòng và mời bạn bè cùng nghe/hát</p>
              </div>
            </button>
            {errorMessage && <p className="text-xs text-red-500 text-center">{errorMessage}</p>}
          </div>
        )}

        {view === 'join' && (
          <div className="p-5">
            <p className="text-xs text-text-muted mb-3">{t('room.join_instruction')}</p>
            <div className="flex items-center gap-2 border-2 border-gray-200 dark:border-gray-700 rounded-full px-4 py-2.5 focus-within:border-primary-500 transition-colors bg-gray-50 dark:bg-gray-900">
              <Keyboard size={18} className="text-text-muted shrink-0" />
              <input
                autoFocus
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('room.code_placeholder')}
                className="flex-1 bg-transparent text-sm outline-none text-text-color placeholder:text-text-muted"
              />
              <button
                type="button"
                disabled={!code.trim() || isSubmitting}
                onClick={() => handleJoinRoom()}
                className="text-sm font-semibold text-primary-500 disabled:opacity-30 hover:text-primary-600 transition-colors shrink-0"
              >
                {isSubmitting ? '...' : t('room.join_room_btn')}
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-3 text-center">{t('room.join_hint')}</p>
            {errorMessage && <p className="text-xs text-red-500 mt-3 text-center">{errorMessage}</p>}
          </div>
        )}

        {view === 'open' && (
          <div className="p-5 space-y-4">
            {!createdRoomId ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1.5">{t('room.room_name_label')}</label>
                  <div className="flex items-center gap-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 focus-within:border-rose-500 transition-colors bg-gray-50 dark:bg-gray-900">
                    <Radio size={16} className="text-text-muted shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder={t('room.room_name_placeholder')}
                      className="flex-1 bg-transparent text-sm outline-none text-text-color placeholder:text-text-muted"
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    id="isPublicToggle"
                    checked={!isPublic}
                    onChange={(e) => setIsPublic(!e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-rose-500 focus:ring-rose-500"
                  />
                  <label htmlFor="isPublicToggle" className="text-sm font-medium text-text-color cursor-pointer">
                    Phòng riêng tư (Yêu cầu duyệt)
                  </label>
                </div>

                <p className="text-xs text-text-muted">Bạn có thể thêm bài hát YouTube sau khi vào phòng.</p>
                {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setView('menu')}
                    className="flex-1 py-2.5 text-sm font-semibold text-text-muted hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                  >
                    {t('report.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={!roomName.trim() || isSubmitting}
                    onClick={handleCreateRoom}
                    className="flex-1 py-2.5 text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors disabled:opacity-40"
                  >
                    {isSubmitting ? '...' : t('room.open_room_btn')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-4">
                  <p className="text-xs text-text-muted">Mã phòng của bạn</p>
                  <p className="text-2xl font-bold tracking-wider text-emerald-700 dark:text-emerald-300 mt-1">{createdRoomId}</p>
                  <p className="text-xs text-text-muted mt-2">Gửi mã này cho bạn bè để họ tham gia.</p>
                </div>
                {copyMessage && <p className="text-xs text-emerald-600 dark:text-emerald-300 text-center">{copyMessage}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={copyRoomId}
                    className="py-2.5 text-sm font-semibold text-text-color bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Copy ID
                  </button>
                  <button
                    type="button"
                    onClick={() => goToRoom(createdRoomId)}
                    className="py-2.5 text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600 rounded-xl transition-colors"
                  >
                    Vào phòng
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

const LiveRadar = ({ rooms = [], loading = false, error = '', onRefresh }) => {
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [modalMode, setModalMode] = useState('menu');

  const normalizedRooms = useMemo(() => 
    rooms.map(normalizeRoom).filter(room => room.id && room.raw?.status === 'LIVE'), 
  [rooms]);

  const openCreateModal = () => {
    setSelectedRoom(null);
    setModalMode('open');
  };

  const openJoinModal = () => {
    setSelectedRoom(null);
    setModalMode('join');
  };

  return (
    <>
      <div className="bg-surface-color rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              <Radio size={17} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-text-color">Phòng live hát</h3>
              <p className="text-xs text-text-muted">Nghe nhạc, hát và trò chuyện cùng mọi người</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full p-2 text-text-muted hover:bg-gray-100 hover:text-text-color dark:hover:bg-gray-800 disabled:opacity-50"
            title="Làm mới phòng live"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <div className="flex gap-4 min-w-max pb-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="relative flex w-[74px] flex-shrink-0 flex-col items-center gap-1 text-center group"
            >
              <div className="relative w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-rose-500 to-orange-400 transition-transform group-hover:scale-105">
                <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-surface-color bg-rose-500 text-white">
                  <Plus size={22} />
                </div>
              </div>
              <span className="text-[11px] font-semibold leading-tight text-text-color">Tạo phòng</span>
            </button>

            <button
              type="button"
              onClick={openJoinModal}
              className="relative flex w-[74px] flex-shrink-0 flex-col items-center gap-1 text-center group"
            >
              <div className="relative w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-primary-500 to-purple-500 transition-transform group-hover:scale-105">
                <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-surface-color bg-primary-500 text-white">
                  <LogIn size={20} />
                </div>
              </div>
              <span className="text-[11px] font-semibold leading-tight text-text-color">Nhập mã</span>
            </button>

            {loading && !normalizedRooms.length ? (
              [1, 2, 3].map(item => (
                <div key={item} className="flex w-[74px] flex-shrink-0 flex-col items-center gap-2">
                  <div className="h-14 w-14 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
                  <div className="h-3 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
                </div>
              ))
            ) : null}

            {normalizedRooms.map((room) => (
              <button
                type="button"
                key={room.id}
                className="relative flex w-[82px] flex-shrink-0 flex-col items-center gap-1 text-center group"
                onClick={() => {
                  setSelectedRoom(room);
                  setModalMode('menu');
                }}
                title={`${room.name} - ${room.listenersCount} người đang nghe`}
              >
                <div className="relative w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-yellow-400 to-orange-500 transition-transform group-hover:scale-105">
                  {room.hostAvatarUrl ? (
                    <img src={room.hostAvatarUrl} alt={room.name} className="h-full w-full rounded-full border-2 border-surface-color object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-surface-color bg-orange-500 text-white">
                      <Music size={20} />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 bg-surface-color rounded-full p-0.5">
                    <div className="bg-red-500 text-white rounded-full p-1 animate-pulse">
                      <Disc3 size={10} />
                    </div>
                  </div>
                </div>
                <span className="w-full line-clamp-2 text-[11px] font-medium leading-tight text-text-color">{room.name}</span>
                <span className="flex items-center justify-center gap-1 text-[10px] text-text-muted">
                  <Users size={10} /> {room.listenersCount}
                </span>
              </button>
            ))}

            {!loading && !normalizedRooms.length ? (
              <div className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm text-text-muted dark:border-gray-700">
                <Headphones size={20} className="text-rose-500" />
                <span>Chưa có phòng live nào. Hãy tạo phòng đầu tiên.</span>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{error}</p>
        ) : null}
      </div>

      {(selectedRoom || modalMode !== 'menu') && (
        <RoomModal
          room={selectedRoom}
          mode={modalMode}
          onCreated={onRefresh}
          onClose={() => {
            setSelectedRoom(null);
            setModalMode('menu');
          }}
        />
      )}
    </>
  );
};

export default LiveRadar;
