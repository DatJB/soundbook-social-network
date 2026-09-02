import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

import LiveRadar from '../components/newsfeed/LiveRadar';
import CreatePost from '../components/newsfeed/CreatePost';
import FeedPost from '../components/newsfeed/FeedPost';
import NewsfeedSidebar from '../components/newsfeed/NewsfeedSidebar';
import { feedApi } from '../services/feed';
import { getActiveRooms } from '../services/room';
import { friendsApi } from '../services/friends';
import { normalizePost, normalizeSuggestion, normalizeTrending } from '../utils/feedNormalizers';
import { useMusicPlayer, extractVideoId, isAudioPost } from '../context/MusicPlayerContext';

const PAGE_SIZE = 10;

const Newsfeed = () => {
  const { t } = useLanguage();
  const { currentTrack, isPlaying, playTrack, stopTrack } = useMusicPlayer();

  const [activeTab, setActiveTab] = useState('following');
  const [payload, setPayload] = useState({ posts: [], friendSuggestions: [], trending: [], incomingRequests: [] });
  const [activeRooms, setActiveRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef(null);
  const offsetRef = useRef(0);
  const isFetchingRef = useRef(false);
  const observerRef = useRef(null);

  const loadActiveRooms = useCallback(async () => {
    setRoomsLoading(true);
    setRoomsError('');
    try {
      const response = await getActiveRooms(12);
      setActiveRooms(Array.isArray(response?.data) ? response.data : []);
    } catch (err) {
      setRoomsError(err?.message || 'Không thể tải phòng live.');
      setActiveRooms([]);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  // Load lần đầu hoặc khi đổi tab
  const loadFeed = useCallback(async (tab) => {
    setLoading(true);
    setError('');
    offsetRef.current = 0;
    isFetchingRef.current = false;
    try {
      const data = await feedApi.getFeed({
        tab: tab === 'foryou' ? 'discover' : 'following',
        limit: PAGE_SIZE,
        offset: 0,
      });
      const newPosts = data?.posts || [];
      offsetRef.current = newPosts.length;
      setPayload(prev => ({
        ...prev,
        posts: newPosts,
        friendSuggestions: data?.friendSuggestions || [],
        trending: data?.trending || [],
      }));
      setHasMore(newPosts.length === PAGE_SIZE);
    } catch (err) {
      setError(err?.message || 'Không thể tải bảng tin.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load thêm khi scroll
  const loadMore = useCallback(async (tab) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoadingMore(true);
    try {
      const data = await feedApi.getFeed({
        tab: tab === 'foryou' ? 'discover' : 'following',
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      });
      const newPosts = data?.posts || [];
      offsetRef.current += newPosts.length;
      setPayload(prev => ({
        ...prev,
        posts: [...prev.posts, ...newPosts],
      }));
      setHasMore(newPosts.length === PAGE_SIZE);
    } catch (err) {
      console.error('Không thể load thêm bài:', err);
    } finally {
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Reset khi đổi tab
  useEffect(() => {
    setHasMore(true);
    loadFeed(activeTab);
  }, [activeTab, loadFeed]);

  // IntersectionObserver sentinel - dùng callback ref để re-attach khi sentinel mount/unmount
  const setSentinelRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    sentinelRef.current = node;
    if (!node) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore(activeTab);
        }
      },
      { rootMargin: '300px' }
    );
    observerRef.current.observe(node);
  }, [activeTab, loadMore]);

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const hub = await friendsApi.getFriendHub();
        setPayload(prev => ({ ...prev, incomingRequests: hub?.incomingRequests || [] }));
      } catch (e) {
        console.error('Failed to load friend requests:', e);
      }
    };
    loadRequests();
  }, []);

  useEffect(() => {
    loadActiveRooms();
  }, [loadActiveRooms]);

  const posts = useMemo(() => payload.posts.map(normalizePost), [payload.posts]);
  const suggestions = useMemo(() => payload.friendSuggestions.map(normalizeSuggestion), [payload.friendSuggestions]);
  const trending = useMemo(() => payload.trending.map(normalizeTrending), [payload.trending]);
  const incomingRequests = payload.incomingRequests;

  /** Toggle play for a post. Only audio posts go through global player. */
  const handleTogglePlay = (post) => {
    if (!isAudioPost(post)) return; // video posts use inline YouTube embed
    const videoId = extractVideoId(post);
    if (!videoId) return;

    const trackObj = { ...post, _videoId: videoId };
    playTrack(trackObj);
  };

  const isPostPlaying = (post) =>
    isAudioPost(post) && currentTrack?.id === post.id && isPlaying;

  const prependPost = (rawPost) => {
    if (!rawPost?.id) return;
    setPayload(prev => ({
      ...prev,
      posts: [rawPost, ...(prev.posts || []).filter(item => item.id !== rawPost.id)],
    }));
  };

  const removePost = (postId) => {
    setPayload(prev => ({
      ...prev,
      posts: (prev.posts || []).filter(item => item.id !== postId),
    }));
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 relative">
      <div className="flex-1 lg:w-[70%] space-y-6 overflow-hidden">
        <LiveRadar
          rooms={activeRooms}
          loading={roomsLoading}
          error={roomsError}
          onRefresh={loadActiveRooms}
        />

        <CreatePost onCreated={prependPost} />

        <div className="flex gap-6 border-b border-gray-200 dark:border-gray-800 px-2">
          <button
            className={`pb-3 font-medium text-sm transition-colors relative ${activeTab === 'following' ? 'text-primary-500' : 'text-text-muted hover:text-text-color'}`}
            onClick={() => setActiveTab('following')}
          >
            {t('feed.following')}
            {activeTab === 'following' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-500 rounded-t-full" />}
          </button>
          <button
            className={`pb-3 font-medium text-sm transition-colors relative ${activeTab === 'foryou' ? 'text-primary-500' : 'text-text-muted hover:text-text-color'}`}
            onClick={() => setActiveTab('foryou')}
          >
            {t('feed.foryou')}
            {activeTab === 'foryou' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary-500 rounded-t-full" />}
          </button>
        </div>

        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <div className="flex items-center gap-2"><AlertCircle size={18} /> {error}</div>
            <button onClick={() => loadFeed(activeTab)} className="rounded-lg bg-red-100 px-3 py-1.5 font-semibold hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-900">
              Tải lại
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-surface-color p-8 text-center shadow-sm dark:border-gray-800">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary-500/20 border-t-primary-500" />
            <p className="font-semibold">Đang tải bảng tin...</p>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
            {posts.length ? posts.map((post) => (
              <FeedPost
                key={post.id}
                post={post}
                isPlaying={isPostPlaying(post)}
                onTogglePlay={() => handleTogglePlay(post)}
                onDeleted={removePost}
                onShared={prependPost}
              />
            )) : (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-surface-color p-8 text-center text-sm text-text-muted dark:border-gray-700">
                Chưa có bài viết phù hợp. Hãy theo dõi thêm bạn bè hoặc tạo bài viết mới.
              </div>
            )}
            {/* Sentinel for infinite scroll */}
            <div ref={setSentinelRef} className="h-4" />
            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500/20 border-t-primary-500" />
              </div>
            )}
            {!hasMore && posts.length > 0 && (
              <div className="py-6 text-center text-sm text-text-muted">Bạn đã xem hết bài viết 🎉</div>
            )}
          </div>
        )}
      </div>

      <NewsfeedSidebar suggestions={suggestions} trending={trending} requests={incomingRequests} onRefreshRequests={() => {
        friendsApi.getFriendHub().then(hub => setPayload(prev => ({ ...prev, incomingRequests: hub?.incomingRequests || [] })));
      }} />
    </div>
  );
};

export default Newsfeed;
