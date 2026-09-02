import React from 'react';
import { Link } from 'react-router-dom';
import {
  Share2,
  Edit3,
  Settings,
  Play,
  Pause,
  UserPlus,
  UserCheck,
  Clock,
  Check,
  MessageCircle,
  Bell,
  BellOff,
  Music2,
  Flag,
} from 'lucide-react';

const ProfileHeader = ({
  profileData,
  isGuest,
  isPlaying,
  onTogglePlay,
  t,
  onAddFriend,
  onAcceptFriend,
  onMessage,
  onShareProfile,
  onChangeAvatar,
  onChangeCover,
  onChangePinnedTrack,
  onFollow,
  onUnfollow,
  onReport,
  onPlayerReady,
  socialBusy = false,
}) => {
  const handleTogglePlay = () => {
    if (!canPlayPinnedTrack) return;
    onTogglePlay?.();
  };

  const status = profileData.friendshipStatus || 'NONE';
  const showMessage = status === 'FRIENDS' && profileData.canMessage;
  const pinnedSong = profileData.pinnedSong || {};
  const canPlayPinnedTrack = Boolean(pinnedSong.videoId && profileData.allowPreviewPlayer !== false);


  return (
    <div className={`w-full h-64 sm:h-80 relative bg-gradient-to-b ${profileData.themeColor}`}>
      <div className="absolute inset-0 overflow-hidden">
        {profileData.coverUrl ? <img src={profileData.coverUrl} alt="cover" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40" />
      </div>

      <div className="absolute top-6 right-6 flex gap-3 z-10">
        <button onClick={onShareProfile} className="p-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white transition-colors" title={t('profile.share', { defaultValue: 'Share Profile' })}>
          <Share2 size={20} />
        </button>
        {!isGuest && (
          <>
            <button onClick={onChangeCover} className="p-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white transition-colors" title={t('profile.edit_cover', { defaultValue: 'Edit Cover Photo' })}>
              <Edit3 size={20} />
            </button>
            <button onClick={onChangePinnedTrack} className="p-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white transition-colors" title="Đổi nhạc ghim YouTube">
              <Music2 size={20} />
            </button>
            <Link to="/taste-settings" className="p-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white transition-colors" title={t('header.settings')}>
              <Settings size={20} />
            </Link>
          </>
        )}
      </div>

      <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row items-end justify-between gap-6 z-10 w-auto">
        <div className="flex items-end gap-x-6 gap-y-4 flex-wrap w-full sm:w-auto">
          <div className="relative group translate-y-1 sm:translate-y-2">
            <div className="absolute -inset-2 rounded-full border-4 border-white/20 animate-pulse" />
            <div className="absolute -inset-4 rounded-full border-4 border-white/10 animate-ping" style={{ animationDuration: '3s' }} />

            {profileData.avatarUrl ? (
              <img src={profileData.avatarUrl} alt={profileData.name} className="w-28 h-28 sm:w-36 sm:h-36 rounded-full border-4 border-surface-color shadow-2xl relative z-10 object-cover" />
            ) : (
              <div className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full border-4 border-surface-color shadow-2xl relative z-10 ${profileData.avatar} flex items-center justify-center text-4xl font-bold text-white`}>
                {(profileData.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            {!isGuest && (
              <button onClick={onChangeAvatar} className="absolute bottom-2 right-2 p-2 bg-surface-color text-text-color rounded-full shadow-lg z-20 hover:scale-110 transition-transform" title="Đổi ảnh đại diện">
                <Edit3 size={16} />
              </button>
            )}
          </div>

          <div className="text-white drop-shadow-md pb-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{profileData.name}</h1>
            <p className="text-sm font-medium text-white/80 mt-1">{profileData.username}</p>
            {profileData.description && <p className="text-sm text-white/90 mt-3 max-w-lg leading-relaxed">{profileData.description}</p>}
            {profileData.publicInfo ? <p className="text-xs text-white/80 mt-2 max-w-lg leading-relaxed">{profileData.publicInfo}</p> : null}
            {profileData.stats ? (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/90">
                <span className="rounded-full bg-white/15 px-2.5 py-1">{profileData.stats.posts} bài viết</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1">{profileData.stats.friends} bạn bè</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1">{profileData.stats.followers} người theo dõi</span>
              </div>
            ) : null}

            {isGuest ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={profileData.following ? onUnfollow : onFollow}
                  disabled={socialBusy}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg disabled:opacity-60 ${profileData.following ? 'bg-white/20 text-white backdrop-blur-md hover:bg-white/30' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}
                >
                  {profileData.following ? <BellOff size={16} /> : <Bell size={16} />}
                  {profileData.following ? 'Đang theo dõi' : 'Theo dõi'}
                </button>

                {showMessage ? (
                  <button onClick={onMessage} disabled={socialBusy} className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-primary-600 disabled:opacity-60">
                    <MessageCircle size={16} /> Nhắn tin
                  </button>
                ) : status === 'OUTGOING_REQUEST' ? (
                  <button disabled className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
                    <Clock size={16} /> Đã gửi lời mời
                  </button>
                ) : status === 'INCOMING_REQUEST' ? (
                  <button onClick={onAcceptFriend} disabled={socialBusy} className="inline-flex items-center gap-2 rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-green-600 disabled:opacity-60">
                    <Check size={16} /> Chấp nhận kết bạn
                  </button>
                ) : status === 'FRIENDS' ? (
                  <button disabled className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
                    <UserCheck size={16} /> Bạn bè
                  </button>
                ) : (
                  <button onClick={onAddFriend} disabled={socialBusy} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-lg hover:bg-gray-100 disabled:opacity-60">
                    <UserPlus size={16} /> Kết bạn
                  </button>
                )}
                <button
                  onClick={onReport}
                  className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md hover:bg-white/30 transition-colors"
                  title="Báo cáo người dùng"
                >
                  <Flag size={16} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {isGuest && profileData.matchScore !== null && profileData.matchScore !== undefined && (
          <div className="hidden sm:flex flex-col items-center bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-xl">
            <span className="text-xs text-white/80 font-semibold uppercase tracking-wider mb-1">{t('profile.match_score')}</span>
            <div className="text-3xl font-bold text-primary-400">{Math.round(profileData.matchScore)}%</div>
            {profileData.matchReasons?.length ? <div className="mt-2 max-w-[180px] text-center text-[11px] text-white/80">Chung gu: {profileData.matchReasons.slice(0, 3).join(', ')}</div> : null}
          </div>
        )}

        <div className="w-full sm:w-72 bg-black/40 backdrop-blur-xl rounded-2xl p-3 border border-white/10 shadow-2xl flex items-center gap-3">
          <div className={`relative w-14 h-14 rounded-full shadow-lg overflow-hidden flex-shrink-0 ${!pinnedSong.thumbnail ? pinnedSong.cover : ''} ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
            {pinnedSong.thumbnail ? (
              <img src={pinnedSong.thumbnail} alt={pinnedSong.title} className="h-full w-full object-cover" />
            ) : (
              <>
                <div className="absolute inset-0 border-4 border-black/50 rounded-full" />
                <div className="absolute inset-1/3 bg-black rounded-full border border-gray-700" />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{pinnedSong.title}</p>
            <p className="text-white/70 text-xs truncate">{pinnedSong.artist}</p>
            <p className="text-white/45 text-[10px] truncate">{canPlayPinnedTrack ? 'Nhạc ghim YouTube' : 'Chưa có nhạc ghim phát được'}</p>
            <div className="w-full h-1 bg-white/20 rounded-full mt-1 overflow-hidden"><div className={`h-full rounded-full ${isPlaying ? 'bg-primary-400 w-2/3' : 'bg-white w-1/4'}`} /></div>
          </div>
          <button onClick={handleTogglePlay} disabled={!canPlayPinnedTrack} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0 hover:scale-105 transition-transform disabled:cursor-not-allowed disabled:opacity-50">
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileHeader;
