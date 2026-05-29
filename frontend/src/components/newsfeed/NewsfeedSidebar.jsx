import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Clock, MessageCircle, Music, Book, UserPlus, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { friendsApi } from '../../services/friends';

const Avatar = ({ user, size = 'w-10 h-10' }) => {
  const url = user?.avatarUrl || user?.profilePic;
  if (url) {
    return <img src={url} alt={user.name || user.displayName || 'avatar'} className={`${size} rounded-full object-cover`} />;
  }
  return <div className={`${size} rounded-full ${user?.avatar || 'bg-primary-500'} flex items-center justify-center text-xs font-bold text-white`}>{(user?.name || user?.displayName || 'U').charAt(0).toUpperCase()}</div>;
};

const NewsfeedSidebar = ({ suggestions = [], trending = [], requests = [], onRefreshRequests }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [statuses, setStatuses] = useState({});
  const [busyUserId, setBusyUserId] = useState(null);

  const resolveStatus = (user) => statuses[user.id]?.friendshipStatus || user.friendshipStatus || 'NONE';
  const displaySuggestions = suggestions.filter(user => {
    const status = resolveStatus(user);
    return !status || status === 'NONE';
  });

  const handleAddFriend = async (user) => {
    try {
      setBusyUserId(user.id);
      const result = await friendsApi.sendRequest(user.id);
      setStatuses((prev) => ({ ...prev, [user.id]: result }));
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAccept = async (requestId) => {
    try {
      setBusyUserId(`req-${requestId}`);
      await friendsApi.acceptRequest(requestId);
      showToast('Đã chấp nhận lời mời kết bạn', 'success');
      onRefreshRequests?.();
    } catch (err) {
      showToast(err?.message || 'Lỗi khi chấp nhận lời mời', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDecline = async (requestId) => {
    try {
      setBusyUserId(`req-${requestId}`);
      await friendsApi.declineRequest(requestId);
      showToast('Đã từ chối lời mời kết bạn', 'success');
      onRefreshRequests?.();
    } catch (err) {
      showToast(err?.message || 'Lỗi khi từ chối lời mời', 'error');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleMessage = async (user) => {
    try {
      setBusyUserId(user.id);
      const result = await friendsApi.startChat(user.id);
      if (result?.dmThreadId) {
        navigate(`/chat?threadId=${result.dmThreadId}`);
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const renderAction = (user) => {
    const status = resolveStatus(user);
    if (status === 'FRIENDS') {
      return (
        <button onClick={() => handleMessage(user)} disabled={busyUserId === user.id} title="Nhắn tin" className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-500 hover:bg-primary-500 hover:text-white transition-colors disabled:opacity-60">
          <MessageCircle size={16} />
        </button>
      );
    }
    if (status === 'OUTGOING_REQUEST') {
      return <div title="Đã gửi lời mời" className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600"><Clock size={16} /></div>;
    }
    if (status === 'INCOMING_REQUEST') {
      return <div title="Đang chờ bạn phản hồi" className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600"><Check size={16} /></div>;
    }
    return (
      <button onClick={() => handleAddFriend(user)} disabled={busyUserId === user.id} title="Kết bạn" className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-text-muted hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-60">
        <UserPlus size={16} />
      </button>
    );
  };

  return (
    <div className="hidden lg:block lg:w-[30%] space-y-6">

      {/* Friend Suggestions */}
      <div className="bg-surface-color rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
        <h3 className="font-bold text-sm mb-4 uppercase tracking-wider text-text-muted">{t('feed.friend_suggestions')}</h3>
        <div className="space-y-4">
          {displaySuggestions.length ? displaySuggestions.map(user => (
            <div key={user.id} className="flex items-center justify-between gap-2 group">
              <Link to={`/profile/${user.id}`} className="flex min-w-0 items-center gap-3">
                <Avatar user={user} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm group-hover:underline cursor-pointer">{user.name}</p>
                  <p className="text-xs text-primary-500 font-medium">{user.match}% Match</p>
                  {user.sharedFeatures?.length ? (
                    <p className="mt-0.5 truncate text-[10px] text-text-muted">{user.sharedFeatures.slice(0, 2).join(', ')}</p>
                  ) : null}
                </div>
              </Link>
              {renderAction(user)}
            </div>
          )) : (
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-text-muted dark:bg-gray-800/60">
              Chưa có gợi ý phù hợp.
            </div>
          )}
        </div>
      </div>

      {/* Trending Now */}
      <div className="bg-surface-color rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
        <h3 className="font-bold text-sm mb-4 uppercase tracking-wider text-text-muted">{t('feed.trending_now')}</h3>
        <div className="space-y-4">
          {trending.length ? trending.map((item, i) => (
            <div key={`${item.id}-${i}`} className="flex gap-3 group cursor-pointer">
              <div className="text-text-muted font-bold text-lg select-none w-4">{i + 1}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold text-sm group-hover:underline">{item.title}</p>
                  {item.type === 'music' ? <Music size={12} className="text-purple-500" /> : <Book size={12} className="text-orange-500" />}
                </div>
                <p className="truncate text-xs text-text-muted">{item.subtitle}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{item.count}</p>
              </div>
            </div>
          )) : (
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-text-muted dark:bg-gray-800/60">
              Chưa có nội dung nổi bật.
            </div>
          )}
        </div>
      </div>

      {/* Incoming Requests */}
      <div className="bg-surface-color rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-800">
        <h3 className="font-bold text-sm mb-4 uppercase tracking-wider text-text-muted">Lời mời kết bạn</h3>
        <div className="space-y-4">
          {requests.length ? requests.map(req => (
            <div key={req.requestId} className="flex items-center justify-between gap-2 group">
              <Link to={`/profile/${req.userId}`} className="flex min-w-0 items-center gap-3">
                <Avatar user={req} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm group-hover:underline cursor-pointer">{req.displayName}</p>
                  <p className="text-xs text-primary-500 font-medium">{Math.round(req.matchScore || 0)}% Match</p>
                </div>
              </Link>
              <div className="flex gap-1">
                <button 
                  onClick={() => handleAccept(req.requestId)}
                  disabled={busyUserId === `req-${req.requestId}`}
                  className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 hover:bg-green-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  <Check size={14} />
                </button>
                <button 
                  onClick={() => handleDecline(req.requestId)}
                  disabled={busyUserId === `req-${req.requestId}`}
                  className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )) : (
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-text-muted dark:bg-gray-800/60 text-center">
              Chưa có lời mời đến.
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-text-muted flex flex-wrap justify-center gap-x-3 gap-y-2 px-2">
        <span>© 2026 Soundbook</span>
      </div>
    </div>
  );
};

export default NewsfeedSidebar;
