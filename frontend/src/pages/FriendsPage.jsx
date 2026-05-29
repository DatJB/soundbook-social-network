import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Clock, MessageCircle, Search, UserPlus, X, Flag } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { friendsApi } from '../services/friends';
import { profileApi } from '../services/profile';
import { getCurrentUser } from '../services/auth';
import ReportModal from '../components/common/ReportModal';

const AVATAR_CLASSES = ['bg-blue-500', 'bg-pink-500', 'bg-green-500', 'bg-purple-500', 'bg-yellow-500', 'bg-teal-500', 'bg-rose-500', 'bg-indigo-500', 'bg-orange-500'];
const fallbackAvatar = (id) => AVATAR_CLASSES[Number(id || 0) % AVATAR_CLASSES.length];

const Avatar = ({ friend }) => {
  if (friend.avatarUrl) {
    return <img src={friend.avatarUrl} alt={friend.displayName} className="w-12 h-12 rounded-full border-2 border-surface-color shadow-sm object-cover" />;
  }
  return <div className={`w-12 h-12 rounded-full ${fallbackAvatar(friend.userId)} border-2 border-surface-color shadow-sm flex items-center justify-center text-white font-bold`}>{(friend.displayName || 'U').charAt(0).toUpperCase()}</div>;
};

const FriendsPage = () => {
  const { id } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('friends');
  const [data, setData] = useState({ friends: [], incomingRequests: [], outgoingRequests: [], suggestions: [] });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [reportTarget, setReportTarget] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const currentUser = getCurrentUser();
      const isMe = !id || id === 'me' || String(id) === String(currentUser?.id);

      if (isMe) {
        const hub = await friendsApi.getFriendHub();
        const friends = hub?.friends || [];
        const friendIds = new Set(friends.map(f => f.userId || f.id));
        const suggestions = (hub?.suggestions || []).filter(s => !friendIds.has(s.userId || s.id) && (!s.friendshipStatus || s.friendshipStatus === 'NONE'));
        
        setData({
          friends: friends,
          incomingRequests: hub?.incomingRequests || [],
          outgoingRequests: hub?.outgoingRequests || [],
          suggestions: suggestions,
        });
      } else {
        const otherFriends = await profileApi.getFriends(id);
        setData({
          friends: otherFriends || [],
          incomingRequests: [],
          outgoingRequests: [],
          suggestions: [],
        });
        setTab('friends');
      }
    } catch (err) {
      setError(err?.message || 'Không thể tải danh sách bạn bè.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const filtered = useMemo(() => {
    const lists = {
      friends: data.friends,
      incoming: data.incomingRequests,
      outgoing: data.outgoingRequests,
      suggestions: data.suggestions,
    };
    const keyword = search.trim().toLowerCase();
    return (lists[tab] || []).filter(friend => !keyword || String(friend.displayName || '').toLowerCase().includes(keyword) || String(friend.username || '').toLowerCase().includes(keyword));
  }, [data.friends, data.incomingRequests, data.outgoingRequests, data.suggestions, tab, search]);

  const runAction = async (key, action, successMessage) => {
    try {
      setBusyKey(key);
      await action();
      if (successMessage) showToast(successMessage, 'success');
      await load();
    } catch (err) {
      showToast(err?.message || 'Có lỗi xảy ra', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const handleMessage = async (friend) => {
    await runAction(`msg-${friend.userId}`, async () => {
      const result = await friendsApi.startChat(friend.userId);
      if (result?.dmThreadId) navigate(`/chat?threadId=${result.dmThreadId}`);
    });
  };

  const renderActions = (friend) => {
    if (tab === 'friends') {
      return (
        <button onClick={() => handleMessage(friend)} disabled={busyKey === `msg-${friend.userId}`} className="p-2 rounded-full text-text-muted hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors disabled:opacity-60" title="Nhắn tin">
          <MessageCircle size={18} />
        </button>
      );
    }
    if (tab === 'incoming') {
      return (
        <div className="flex gap-2">
          <button onClick={() => runAction(`accept-${friend.requestId}`, () => friendsApi.acceptRequest(friend.requestId), 'Đã chấp nhận lời mời kết bạn')} disabled={busyKey === `accept-${friend.requestId}`} className="p-2 rounded-full text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><Check size={18} /></button>
          <button onClick={() => runAction(`decline-${friend.requestId}`, () => friendsApi.declineRequest(friend.requestId), 'Đã từ chối lời mời kết bạn')} disabled={busyKey === `decline-${friend.requestId}`} className="p-2 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><X size={18} /></button>
        </div>
      );
    }
    if (tab === 'outgoing') {
      return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"><Clock size={13} /> Đang chờ</span>;
    }
    return (
      <button onClick={() => runAction(`add-${friend.userId}`, () => friendsApi.sendRequest(friend.userId), 'Đã gửi lời mời kết bạn')} disabled={busyKey === `add-${friend.userId}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-60"><UserPlus size={15} /> Kết bạn</button>
    );
  };

  const isMe = !id || id === 'me' || String(id) === String(getCurrentUser()?.id);

  const tabs = isMe ? [
    ['friends', `Bạn bè (${data.friends.length})`],
    ['incoming', `Lời mời đến (${data.incomingRequests.length})`],
    ['outgoing', `Đã gửi (${data.outgoingRequests.length})`],
    ['suggestions', `Gợi ý (${data.suggestions.length})`],
  ] : [
    ['friends', `Bạn bè (${data.friends.length})`],
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      <div className="flex items-center gap-3">
        <Link to={`/profile/${id}`} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-text-muted transition-colors"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold">{t('profile.friends', { defaultValue: 'Friends' })}</h1>
          <p className="text-xs text-text-muted">Quản lý bạn bè, lời mời và gợi ý kết nối.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${tab === value ? 'bg-primary-500 text-white' : 'bg-gray-100 text-text-muted hover:text-text-color dark:bg-gray-800'}`}>{label}</button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search_friends', { defaultValue: 'Search friends...' })} className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none text-sm transition-all" />
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div> : null}

      <div className="bg-surface-color rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          <p className="text-center text-text-muted text-sm py-12">Đang tải dữ liệu...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-text-muted text-sm py-12">Không có dữ liệu phù hợp.</p>
        ) : filtered.map(friend => (
          <div key={`${tab}-${friend.userId}`} className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <Avatar friend={friend} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{friend.displayName}</p>
              <p className="text-xs text-primary-500 font-medium">{Math.round(friend.matchScore || 0)}% Match</p>
              <p className="text-xs mt-0.5 text-text-muted truncate">{friend.sharedFeatures?.slice(0, 3).join(', ') || friend.username || friend.bio || 'Soundbook user'}</p>
            </div>
            <div className="flex gap-2 shrink-0 items-center">
              {renderActions(friend)}
              <Link to={`/profile/${friend.userId}`} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-500 text-text-muted transition-colors">{t('profile.view', { defaultValue: 'View' })}</Link>
              <button
                onClick={() => setReportTarget(friend)}
                className="p-2 rounded-lg text-text-muted hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                title="Báo cáo"
              >
                <Flag size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        type="USER"
        targetId={reportTarget?.userId || reportTarget?.id}
      />
    </div>
  );
};

export default FriendsPage;
