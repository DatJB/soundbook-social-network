import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Heart, MessageSquare, Users, UserPlus, Tv2, Sparkles, X, CheckCheck, Trash2 } from 'lucide-react';
import { notificationsApi } from '../../services/notifications';
import { getCurrentUser, resolveUrl } from '../../services/auth';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { subscribeTopic } from '../../lib/realtime';

/* ─── Helpers ─────────────────────────────────────────────────── */

const TYPE_CONFIG = {
  LIKE:           { icon: Heart,       color: 'text-rose-500',   bg: 'bg-rose-500/10',   label: 'liked your post' },
  COMMENT:        { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/10',   label: 'commented on your post' },
  FOLLOW:         { icon: Users,       color: 'text-green-500',  bg: 'bg-green-500/10',  label: 'started following you' },
  FRIEND_REQUEST: { icon: UserPlus,    color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'sent you a friend request' },
  ROOM_INVITE:    { icon: Tv2,         color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'invited you to a room' },
  MATCH:          { icon: Sparkles,    color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'is a great match for you' },
};

const getNavTarget = (notif, currentUserId) => {
  const { type, targetId, actorUserId } = notif;
  if (type === 'FOLLOW' || type === 'FRIEND_REQUEST' || type === 'MATCH') return actorUserId ? `/profile/${actorUserId}` : null;
  if (type === 'ROOM_INVITE') return targetId ? `/room/${targetId}` : null;
  // LIKE / COMMENT: đến profile của chủ bài viết (currentUser) với post highlight
  if ((type === 'LIKE' || type === 'COMMENT') && targetId && currentUserId) {
    return `/profile/${currentUserId}?post=${targetId}`;
  }
  return null;
};

const formatTime = (dt) => {
  if (!dt) return '';
  const d = new Date(dt);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const ActorAvatar = ({ notif }) => {
  const { actorAvatarUrl, actorDisplayName } = notif;
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.LIKE;
  const IconComp = cfg.icon;

  return (
    <div className="relative flex-shrink-0">
      {actorAvatarUrl ? (
        <img
          src={resolveUrl(actorAvatarUrl)}
          alt={actorDisplayName}
          className="w-10 h-10 rounded-full object-cover"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center font-semibold text-primary-500 text-sm">
          {(actorDisplayName || 'U').charAt(0).toUpperCase()}
        </div>
      )}
      <span className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ${cfg.bg}`}>
        <IconComp size={11} className={cfg.color} />
      </span>
    </div>
  );
};

/* ─── Notification Item ────────────────────────────────────────── */

const NotifItem = ({ notif, onRead, onDelete, onNavigate, currentUserId }) => {
  const navigate = useNavigate();
  const cfg = TYPE_CONFIG[notif.type] || {};

  const handleClick = async () => {
    if (!notif.isRead) await onRead(notif.id);
    const path = getNavTarget(notif, currentUserId);
    if (path) {
      onNavigate?.();   // đóng dropdown
      navigate(path);
    }
  };

  return (
    <div
      className={`group flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200
        hover:bg-gray-100 dark:hover:bg-gray-800/60
        ${!notif.isRead ? 'bg-primary-500/5 dark:bg-primary-500/8' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <ActorAvatar notif={notif} />

      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug text-text-color">
          <span className="font-semibold">{notif.actorDisplayName || 'Someone'}</span>
          {' '}
          <span className="text-text-muted">{cfg.label || notif.type?.toLowerCase().replace('_', ' ')}</span>
        </p>
        {notif.content && (
          <p className="text-xs text-text-muted mt-0.5 truncate">{notif.content}</p>
        )}
        <p className={`text-[11px] mt-1 ${!notif.isRead ? 'text-primary-500 font-medium' : 'text-text-muted'}`}>
          {formatTime(notif.createdAt)}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1">
        {!notif.isRead && (
          <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-1" />
        )}
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400 transition-all"
          onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}
          title="Delete"
          aria-label="Delete notification"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
};

/* ─── Main Dropdown ────────────────────────────────────────────── */

const NotificationDropdown = () => {
  const currentUser = getCurrentUser();
  const userId = currentUser?.id;
  const { t } = useLanguage();

  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const dropdownRef = useRef(null);
  const pollRef = useRef(null);

  /* ── Fetch unread count (polls every 30s) ─── */
  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await notificationsApi.getUnreadCount(userId);
      setUnreadCount(typeof res === 'number' ? res : (res?.count ?? 0));
    } catch { /* silent */ }
  }, [userId]);

  useEffect(() => {
    fetchUnreadCount();
    pollRef.current = setInterval(fetchUnreadCount, 30_000);
    return () => clearInterval(pollRef.current);
  }, [fetchUnreadCount]);

  /* ── WebSocket: subscribe to real-time notifications ─── */
  useEffect(() => {
    if (!userId) return;
    let unsubscribe;
    subscribeTopic(`/topic/notifications/${userId}`, (notif) => {
      // Prepend new notification to the top of the list
      setNotifs((prev) => {
        // Avoid duplicates if already present
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });
      // Bump unread badge immediately
      setUnreadCount((c) => c + 1);
    }).then((unsub) => { unsubscribe = unsub; }).catch(() => {});

    return () => { if (unsubscribe) unsubscribe(); };
  }, [userId]);

  /* ── Fetch notifications when dropdown opens ─── */
  const fetchNotifs = useCallback(async (nextCursor = null) => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await notificationsApi.getNotifications(userId, nextCursor);
      const items = res?.items ?? res ?? [];
      setNotifs((prev) => nextCursor ? [...prev, ...items] : items);
      setCursor(res?.nextCursor ?? null);
      setHasMore(!!res?.nextCursor);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    if (open) fetchNotifs();
  }, [open, fetchNotifs]);

  /* ── Click outside close ─── */
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleRead = async (id) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const handleDelete = async (id) => {
    try {
      await notificationsApi.deleteNotification(id);
      const deleted = notifs.find((n) => n.id === id);
      setNotifs((prev) => prev.filter((n) => n.id !== id));
      if (deleted && !deleted.isRead) setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    try {
      await notificationsApi.markAllAsRead(userId);
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Button */}
      <button
        type="button"
        id="notification-bell-btn"
        onClick={() => setOpen((p) => !p)}
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500"
        title="Notifications"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-white dark:border-gray-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          id="notification-dropdown-panel"
          role="dialog"
          aria-label="Notifications"
          className="absolute top-12 right-0 w-80 sm:w-96 bg-surface-color rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden z-50
            animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ animation: 'notifDropIn 0.18s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-primary-500" />
              <span className="font-semibold text-sm text-text-color">{t('header.notifications')}</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-500 text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors"
                  title={t('notification.mark_all_read')}
                >
                  <CheckCheck size={13} />
                  <span>{t('notification.mark_all_read')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
                aria-label="Close notifications"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[420px] overflow-y-auto p-2 space-y-0.5">
            {loading && notifs.length === 0 ? (
              <div className="flex flex-col gap-3 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifs.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-3 text-text-muted">
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Bell size={24} className="opacity-40" />
                </div>
                <p className="text-sm">{t('notification.empty')}</p>
              </div>
            ) : (
              notifs.map((notif) => (
                <NotifItem
                  key={notif.id}
                  notif={notif}
                  onRead={handleRead}
                  onDelete={handleDelete}
                />
              ))
            )}

            {hasMore && (
              <button
                type="button"
                onClick={() => fetchNotifs(cursor)}
                disabled={loading}
                className="w-full py-2 text-xs text-primary-500 hover:bg-primary-500/5 rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {loading ? '…' : t('notification.load_more')}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes notifDropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );
};

export default NotificationDropdown;
