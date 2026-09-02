import React, { useCallback, useEffect, useRef, useState } from 'react';
import FeedPost from '../newsfeed/FeedPost';
import CreatePost from '../newsfeed/CreatePost';
import { useMusicPlayer, extractVideoId, isAudioPost } from '../../context/MusicPlayerContext';
import { profileApi } from '../../services/profile';
import { normalizePost } from '../../utils/feedNormalizers';

const PAGE_SIZE = 10;

const ProfilePosts = ({ t, userId, initialPosts = [], isGuest = false, onPostCreated, onPostDeleted, onPostShared }) => {
  const { currentTrack, isPlaying, playTrack } = useMusicPlayer();
  const [posts, setPosts] = useState(() => initialPosts);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPosts.length === PAGE_SIZE);
  const observerRef = useRef(null);
  const pageRef = useRef(1); // page 0 đã load từ initialPosts
  const isFetchingRef = useRef(false);

  // Sync với initialPosts khi profile thay đổi (e.g. user navigate sang profile khác)
  useEffect(() => {
    setPosts(initialPosts);
    pageRef.current = 1;
    isFetchingRef.current = false;
    setHasMore(initialPosts.length === PAGE_SIZE);
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !userId) return;
    isFetchingRef.current = true;
    setLoadingMore(true);
    try {
      const raw = await profileApi.getProfilePosts(userId, pageRef.current, PAGE_SIZE);
      const newPosts = (Array.isArray(raw) ? raw : []).map(normalizePost);
      pageRef.current += 1;
      setPosts(prev => [...prev, ...newPosts]);
      setHasMore(newPosts.length === PAGE_SIZE);
    } catch (err) {
      console.error('Không thể load thêm bài viết:', err);
    } finally {
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [userId]);

  // Callback ref - tự động re-attach observer khi sentinel mount/unmount
  const setSentinelRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingRef.current) {
          loadMore();
        }
      },
      { rootMargin: '300px' }
    );
    observerRef.current.observe(node);
  }, [loadMore]);

  const handleTogglePlay = (post) => {
    if (!isAudioPost(post)) return;
    const videoId = extractVideoId(post);
    if (!videoId) return;
    playTrack({ ...post, _videoId: videoId });
  };

  const isPostPlaying = (post) =>
    isAudioPost(post) && currentTrack?.id === post.id && isPlaying;

  const handlePostCreated = (rawPost) => {
    if (!rawPost?.id) return;
    const normalized = normalizePost(rawPost);
    setPosts(prev => [normalized, ...prev.filter(p => p.id !== normalized.id)]);
    onPostCreated?.(rawPost);
  };

  const handlePostDeleted = (postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    onPostDeleted?.(postId);
  };

  const handlePostShared = (sharedPost) => {
    if (!sharedPost?.id) return;
    const normalized = normalizePost(sharedPost.original || sharedPost);
    setPosts(prev => [normalized, ...prev]);
    onPostShared?.(sharedPost);
  };

  return (
    <div className="pt-8 mt-4 border-t border-gray-200 dark:border-gray-800">
      <h2 className="text-2xl font-bold tracking-tight mb-6">{t('profile.posts_title', { defaultValue: 'Bài đăng & Chia sẻ' })}</h2>
      {!isGuest ? <CreatePost onCreated={handlePostCreated} /> : null}
      <div className="space-y-6 pb-10">
        {posts.length ? posts.map((post) => (
          <FeedPost
            key={post.id}
            post={post}
            isPlaying={isPostPlaying(post)}
            onTogglePlay={() => handleTogglePlay(post)}
            onDeleted={handlePostDeleted}
            onShared={handlePostShared}
          />
        )) : (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-text-muted dark:border-gray-700">
            Chưa có bài viết nào.
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={setSentinelRef} className="h-4" />

        {loadingMore && (
          <div className="flex justify-center py-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500/20 border-t-primary-500" />
          </div>
        )}

        {!hasMore && posts.length > 0 && (
          <div className="py-6 text-center text-sm text-text-muted">
            Bạn đã xem hết bài viết 🎉
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePosts;
