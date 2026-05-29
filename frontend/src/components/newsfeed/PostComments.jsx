import React, { useEffect, useRef, useState } from 'react';
import { Send, Smile, Lock, AlertCircle, Loader2 } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import CommentItem from './CommentItem';
import { getCurrentUser, resolveUrl } from '../../services/auth';

import { postsApi } from '../../services/posts';
import { normalizeComment } from '../../utils/feedNormalizers';

const PostComments = ({ postId, postOwnerId, comments = [], enabled = true, onSubmitComment, onDeleteComment, focusSignal = 0, totalComments = 0, onViewAll, showAll = false }) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const [showAllComments, setShowAllComments] = useState(showAll);
  const [commentInput, setCommentInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [loadingMore, setLoadingMore] = useState(false);
  const [localComments, setLocalComments] = useState(comments);
  const inputRef = useRef(null);

  // Sync local comments when props change (e.g. from FeedPost updates)
  useEffect(() => {
    setLocalComments(comments);
  }, [comments]);

  // Ensure showAllComments stays in sync with prop (critical for modal usage)
  useEffect(() => {
    setShowAllComments(showAll);
  }, [showAll]);

  const displayCount = Math.max(localComments.length, totalComments);

  const handleShowAll = async () => {
    if (onViewAll) {
      onViewAll();
      return;
    }

    if (!showAllComments && localComments.length < totalComments && postId) {
      try {
        setLoadingMore(true);
        const res = await postsApi.getComments(postId);
        if (res?.data?.content) {
          setLocalComments(res.data.content.map(normalizeComment));
        }
      } catch (err) {
        console.error('Failed to fetch all comments', err);
      } finally {
        setLoadingMore(false);
      }
    }
    setShowAllComments(!showAllComments);
  };

  useEffect(() => {
    const handleUserUpdate = () => setCurrentUser(getCurrentUser());
    window.addEventListener('soundbook_user_updated', handleUserUpdate);
    return () => window.removeEventListener('soundbook_user_updated', handleUserUpdate);
  }, []);

  useEffect(() => {
    if (focusSignal) {
      inputRef.current?.focus();
    }
  }, [focusSignal]);

  const rootComments = localComments.filter(c => !c.parentId);
  const visibleComments = showAllComments ? rootComments : rootComments.slice(0, 2);

  const submit = async () => {
    const text = commentInput.trim();
    if (!text || busy || !enabled) return;
    try {
      setBusy(true);
      setError('');
      await onSubmitComment?.(text);
      setCommentInput('');
      setShowAllComments(true);
    } catch (err) {
      setError(err?.message || 'Không thể gửi bình luận.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      {displayCount > 2 && !showAllComments && (
        <button
          onClick={handleShowAll}
          disabled={loadingMore}
          className="text-xs font-medium text-text-muted hover:text-primary-500 transition-colors flex items-center gap-2"
        >
          {loadingMore && <Loader2 size={12} className="animate-spin" />}
          {t('post.view_all_comments').replace('{count}', displayCount)}
        </button>
      )}

      {rootComments.length > 0 && (
        <div className="space-y-3">
          {visibleComments.map(comment => (
            <CommentItem
              key={comment.id}
              postId={postId}
              comment={comment}
              postOwnerId={postOwnerId}
              onDelete={onDeleteComment}
              onReply={(text) => onSubmitComment?.(text, comment.id)}
            />
          ))}
        </div>
      )}

      {showAllComments && displayCount > 2 && (
        <button onClick={() => setShowAllComments(false)} className="text-xs font-medium text-text-muted hover:text-primary-500 transition-colors">
          {t('common.show_less')}
        </button>
      )}

      {error ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle size={14} /> {error}
        </div>
      ) : null}

      {enabled ? (
        <div className="flex items-center gap-2 mt-2">
          <div className="w-7 h-7 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold text-[10px] overflow-hidden flex-shrink-0">
            {currentUser?.avatarUrl ? (
              <img
                src={`${resolveUrl(currentUser.avatarUrl)}${String(currentUser.avatarUrl).includes('?') ? '&' : '?'}t=${currentUser.updatedAt || 'initial'}`}
                alt={currentUser.displayName || 'User'}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{(currentUser?.displayName || 'U').charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 flex items-center bg-gray-100 dark:bg-gray-800/70 rounded-full px-3 py-1.5 gap-2 relative">
            <input
              ref={inputRef}
              type="text"
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
              placeholder={t('post.comment') + '...'}
              className="flex-1 bg-transparent text-xs outline-none text-text-color placeholder:text-text-muted"
            />

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`transition-colors shrink-0 ${showEmojiPicker ? 'text-primary-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                <Smile size={16} />
              </button>

              {showEmojiPicker && (
                <>
                  <div
                    className="fixed inset-0 z-[60]"
                    onClick={() => setShowEmojiPicker(false)}
                  />
                  <div className="absolute bottom-full right-0 mb-3 z-[70] shadow-2xl rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                    <EmojiPicker
                      onEmojiClick={(emojiObject) => {
                        setCommentInput(prev => prev + emojiObject.emoji);
                        inputRef.current?.focus();
                      }}
                      theme={theme === 'dark' ? 'dark' : 'light'}
                      lazyLoadEmojis={true}
                      searchDisabled={false}
                      skinTonesDisabled={false}
                      height={400}
                    />
                  </div>
                </>
              )}
            </div>

            <button onClick={submit} className={`text-primary-500 transition-opacity ${commentInput.trim() ? 'opacity-100' : 'opacity-30'}`} disabled={!commentInput.trim() || busy}>
              <Send size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-xs text-text-muted dark:bg-gray-800/70">
          <Lock size={14} /> Chủ bài viết đã đóng bình luận.
        </div>
      )}
    </div>
  );
};

export default PostComments;
