import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Send, Smile, Flag, Heart, ThumbsUp, Flame, Laugh, Frown, Ghost, Angry, Trash2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmojiPicker from 'emoji-picker-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import ReportModal from '../common/ReportModal';
import ReactionModal from '../common/ReactionModal';
import { getCurrentUser, resolveUrl } from '../../services/auth';
import { postsApi } from '../../services/posts';
import { interactionsApi } from '../../services/interactionsApi';
import { normalizeComment } from '../../utils/feedNormalizers';

const REACTS = [
  { key: 'like', api: 'LIKE', icon: ThumbsUp, label: 'Thích', color: 'text-blue-500', bg: 'bg-blue-500' },
  { key: 'heart', api: 'HEART', icon: Heart, label: 'Yêu thích', color: 'text-rose-500', bg: 'bg-rose-500' },
  { key: 'fire', api: 'FIRE', icon: Flame, label: 'Nhiệt', color: 'text-orange-500', bg: 'bg-orange-500' },
  { key: 'haha', api: 'HAHA', icon: Laugh, label: 'Haha', color: 'text-yellow-500', bg: 'bg-yellow-500', noFill: true },
  { key: 'wow', api: 'WOW', icon: Ghost, label: 'Wow', color: 'text-purple-500', bg: 'bg-purple-500', noFill: true },
  { key: 'sad', api: 'SAD', icon: Frown, label: 'Buồn', color: 'text-indigo-400', bg: 'bg-indigo-400', noFill: true },
  { key: 'angry', api: 'ANGRY', icon: Angry, label: 'Phẫn nộ', color: 'text-red-500', bg: 'bg-red-500', noFill: true },
];

const CommentItem = ({ comment, postOwnerId, onDelete, onReply, postId }) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const [react, setReact] = useState(comment.currentUserReaction?.toUpperCase() || null);
  const [reactCount, setReactCount] = useState(comment.reacts || 0);
  const [showReacts, setShowReacts] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [showReactors, setShowReactors] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [topReacts, setTopReacts] = useState(() => {
    const reactorTypes = comment.reactors ? [...new Set(comment.reactors.map(r => r.reactionType?.toUpperCase()))] : [];
    if (reactorTypes.length > 0) {
      return REACTS.filter(r => reactorTypes.includes(r.api)).slice(0, 3);
    }
    return comment.reacts > 0 ? [REACTS[0]] : [];
  });
  const reactTimeout = useRef(null);

  // Nested Replies State
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const replyInputRef = useRef(null);

  const fetchReplies = async () => {
    if (loadingReplies) return;
    try {
      setLoadingReplies(true);
      const data = await postsApi.getCommentReplies(postId, comment.id);
      console.log('API Replies for comment', comment.id, ':', data);
      const normalized = data.map(normalizeComment);
      console.log('Normalized replies:', normalized);
      setReplies(normalized);
      setShowReplies(true);
    } catch (err) {
      console.error('Failed to fetch replies', err);
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const res = await onReply?.(replyText);
      if (res) {
        // If it was a success, manually add to local replies if visible
        if (showReplies) {
          setReplies(prev => [...prev, normalizeComment(res)]);
        } else if (comment.replyCount === 0) {
          // If first reply, just show it
          setReplies([normalizeComment(res)]);
          setShowReplies(true);
        }
      }
      setReplyText('');
      setReplying(false);
    } catch (err) {
      console.error('Failed to reply', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleNewComment = (e) => {
      const { comment: newComment, postId: eventPostId } = e.detail;
      if (eventPostId === postId && newComment.parentId === comment.id) {
        // If replies are already shown, add the new one
        if (showReplies) {
          setReplies(prev => {
            if (prev.some(r => r.id === newComment.id)) return prev;
            return [...prev, newComment];
          });
        }
      }
    };

    window.addEventListener('soundbook_new_comment', handleNewComment);
    return () => window.removeEventListener('soundbook_new_comment', handleNewComment);
  }, [postId, comment.id, showReplies]);

  // Listen for REACT_COMMENT socket events to update nested reply reactions
  useEffect(() => {
    const handleReactComment = (e) => {
      const { commentId, total, types } = e.detail;
      setReplies(prev => prev.map(r =>
        r.id === commentId ? {
          ...r,
          reacts: total,
          reactors: (types || []).map(t => ({ reactionType: t.toLowerCase() }))
        } : r
      ));
    };
    window.addEventListener('soundbook_react_comment', handleReactComment);
    return () => window.removeEventListener('soundbook_react_comment', handleReactComment);
  }, []);

  // Sync react state from props ONLY on initial mount or comment switch (not on every socket update)
  // If we sync on every `comment.currentUserReaction` change, REACT_COMMENT socket (which doesn't
  // include currentUserReaction) resets our optimistic react state back to null.
  useEffect(() => {
    setReactCount(comment.reacts || 0);
    // Only reset react state from props when switching to a different comment
    setReact(comment.currentUserReaction?.toUpperCase() || null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment.id]);

  // Sync reactCount (only) when the server pushes a new total via socket
  useEffect(() => {
    setReactCount(comment.reacts || 0);
  }, [comment.reacts]);

  // Update topReacts based on reactors list AND current user reaction
  useEffect(() => {
    const reactorTypes = (comment.reactors || []).map(r => r.reactionType?.toUpperCase());
    const myType = String(react || '').toUpperCase();
    
    // Combine them and remove nulls/empty
    const combinedTypes = [...new Set([...reactorTypes, myType])].filter(Boolean);
    
    if (combinedTypes.length > 0) {
      const objects = REACTS.filter(r => combinedTypes.includes(r.api)).slice(0, 3);
      setTopReacts(objects);
    } else if (reactCount > 0) {
      setTopReacts([REACTS[0]]);
    } else {
      setTopReacts([]);
    }
  }, [comment.reactors, react, reactCount]);

  useEffect(() => {
    const handleUserUpdate = () => setCurrentUser(getCurrentUser());
    window.addEventListener('soundbook_user_updated', handleUserUpdate);
    return () => window.removeEventListener('soundbook_user_updated', handleUserUpdate);
  }, []);



  const currentReact = REACTS.find(r => r.api === react);

  const handleMouseEnterReact = () => {
    clearTimeout(reactTimeout.current);
    reactTimeout.current = setTimeout(() => setShowReacts(true), 500);
  };
  const handleMouseLeaveReact = () => {
    clearTimeout(reactTimeout.current);
    reactTimeout.current = setTimeout(() => setShowReacts(false), 300);
  };

  const handleReact = async (rawType) => {
    const type = rawType.toUpperCase();
    const isRemoving = react === type;
    
    // Optimistic update
    setReact(isRemoving ? null : type);
    setReactCount(c => isRemoving ? c - 1 : (react ? c : c + 1));
    setShowReacts(false);
    
    try {
      await interactionsApi.reactToComment(comment.id, type);
      // The socket will eventually broadcast the total count update
    } catch (err) {
      console.error('Failed to react to comment', err);
      // Rollback optimistic update on error
      setReact(comment.currentUserReaction?.toUpperCase() || null);
      setReactCount(comment.reacts || 0);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa bình luận này?")) {
      try {
        // onDelete handles both the API call and state update
        await onDelete?.(comment.id);
      } catch (err) {
        console.error('Failed to delete comment', err);
        alert('Lỗi khi xóa bình luận');
      }
    }
  };

  const allReactors = [
    ...(comment.reactors || []),
    ...(react ? [{ name: t('react.you'), react }] : []),
  ];
  const reactorsByType = REACTS.map(r => ({
    ...r,
    users: allReactors.filter(u => u.react === r.api).map(u => u.name),
  })).filter(r => r.users.length > 0);



  return (
    <div className="flex items-start gap-2.5 group/comment">
      <Link to={`/profile/${comment.user.id}`} className="flex-shrink-0 transition-transform active:scale-95">
        {comment.user.avatarUrl ? (
          <img 
            src={`${resolveUrl(comment.user.avatarUrl)}${String(comment.user.avatarUrl).includes('?') ? '&' : '?'}t=${comment.original?.user?.updatedAt || Date.now()}`} 
            alt={comment.user.name} 
            className="h-7 w-7 rounded-full object-cover" 
          />
        ) : (
          <div className={`w-7 h-7 rounded-full ${comment.user.avatar} flex items-center justify-center text-[10px] font-bold text-white`}>{(comment.user.name || 'U').charAt(0).toUpperCase()}</div>
        )}
      </Link>
      <div className="flex-1 min-w-0">

        <div className="flex items-center gap-2">
          <div className="relative inline-block max-w-full">
            <div className="bg-gray-100 dark:bg-gray-800/70 rounded-2xl px-3 py-2 flex flex-col">
              <Link to={`/profile/${comment.user.id}`} className="text-[13px] font-semibold hover:text-primary-500 transition-colors">
                {comment.user.name}
              </Link>
              <span className="text-[13px] leading-snug">{comment.text}</span>
            </div>
          </div>

          {/* Report */}
          <div className={`relative shrink-0 transition-opacity ${showMenu ? 'opacity-100' : 'opacity-0 group-hover/comment:opacity-100'}`}>
            <button
              onClick={() => setShowMenu(m => !m)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {showMenu && (
              <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[140px] p-1">
                {/* Delete option: if I wrote it OR I own the post */}
                {(currentUser?.id === comment.user.id || currentUser?.id === postOwnerId) && (
                  <button
                    onClick={() => { setShowMenu(false); handleDelete(); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition-colors font-medium"
                  >
                    <Trash2 size={12} />
                    Xóa bình luận
                  </button>
                )}

                {/* Report option: if it is NOT my comment */}
                {currentUser?.id !== comment.user.id && (
                  <button
                    onClick={() => { setShowMenu(false); setIsReportModalOpen(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition-colors font-medium"
                  >
                    <Flag size={12} />
                    {t('comment.report')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Reactions */}
        <div className="flex items-center gap-3 ml-2 mt-1">
          <span className="text-[10px] text-text-muted">{comment.time}</span>

          <div className="relative" onMouseEnter={handleMouseEnterReact} onMouseLeave={handleMouseLeaveReact}>
            {showReacts && (
              <div className="absolute bottom-full left-0 mb-2 flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-2 shadow-xl z-10 animate-react-popup">
                {REACTS.map(r => (
                  <button
                    key={r.key}
                    title={r.label}
                    onClick={() => handleReact(r.api)}
                    className={`transition-transform hover:scale-125 ${r.color}`}
                  >
                    <r.icon size={20} fill={react === r.key && !r.noFill ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                if (react) handleReact(react.toUpperCase()); // Toggle off (ensure uppercase for API)
                else handleReact('LIKE'); // Default like
              }}
              className={`flex items-center gap-1 text-[11px] font-semibold transition-colors ${currentReact ? currentReact.color : 'text-text-muted hover:text-blue-500'
                }`}
            >
              {currentReact ? <currentReact.icon size={12} fill={currentReact.noFill ? "none" : "currentColor"} /> : <ThumbsUp size={12} />}
              {currentReact ? currentReact.label : t('react.like')}
            </button>
          </div>

          {/* Reply */}
          <button
            onClick={() => {
              if (replying) {
                setReplying(false);
              } else {
                setReplying(true);
                setReplyText(`@${comment.user.name} `);
              }
            }}
            className="text-[11px] font-semibold text-text-muted hover:text-primary-500 transition-colors"
          >
            {t('comment.reply')}
          </button>

          {reactCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowReactors(s => !s)}
                className="flex items-center px-0.5 shadow-none hover:opacity-80 transition-opacity text-[11px] leading-none"
              >
                <span className="text-text-muted font-medium mr-1.5">{reactCount}</span>
                <div className="flex -space-x-1">
                  {topReacts.length > 0 ? (
                    topReacts.map((r, i) => (
                      <div key={i} style={{ zIndex: 3 - i }} className={`p-0.5 bg-white dark:bg-gray-800 rounded-full ring-[1.5px] ring-white dark:ring-gray-800`}>
                        <r.icon
                          size={14}
                          fill={r.noFill ? "none" : "currentColor"}
                          className={r.color}
                        />
                      </div>
                    ))
                  ) : (
                    /* Fallback to default like icon if we have count but no specific reactor data yet */
                    <div className="p-0.5 bg-white dark:bg-gray-800 rounded-full ring-[1.5px] ring-white dark:ring-gray-800">
                      <ThumbsUp size={14} fill="currentColor" className="text-blue-500" />
                    </div>
                  )}
                </div>
              </button>

              {showReactors && (
                <ReactionModal
                  isOpen={showReactors}
                  onClose={() => setShowReactors(false)}
                  targetId={comment.id}
                  targetType="COMMENT"
                  title="Người đã bày tỏ cảm xúc về bình luận"
                />
              )}
            </div>
          )}
        </div>

        {/* Reply input */}
        {replying && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold text-[8px] overflow-hidden flex-shrink-0">
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
            <div className="flex-1 flex items-center bg-gray-100 dark:bg-gray-800/70 rounded-full px-3 py-1 gap-2">
              <input
                ref={replyInputRef}
                autoFocus
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendReply(); }}
                placeholder={t('comment.reply_placeholder').replace('{name}', comment.user.name)}
                className="flex-1 bg-transparent text-xs outline-none text-text-color placeholder:text-text-muted"
              />
              
              <div className="relative">
                <button 
                  type="button" 
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`transition-colors shrink-0 ${showEmojiPicker ? 'text-primary-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                >
                  <Smile size={14} />
                </button>

                {showEmojiPicker && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setShowEmojiPicker(false)}
                    />
                    <div className="absolute bottom-full right-0 mb-3 z-[70] shadow-2xl rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                      <EmojiPicker 
                        onEmojiClick={(emojiObject) => {
                          setReplyText(prev => prev + emojiObject.emoji);
                          replyInputRef.current?.focus();
                        }}
                        theme={theme === 'dark' ? 'dark' : 'light'}
                        lazyLoadEmojis={true}
                        searchDisabled={true}
                        skinTonesDisabled={true}
                        height={350}
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={handleSendReply}
                className={`text-primary-500 transition-opacity ${replyText && !isSubmitting ? 'opacity-100' : 'opacity-30'}`}
                disabled={!replyText || isSubmitting}
              >
                <Send size={12} className={isSubmitting ? 'animate-pulse' : ''} />
              </button>
            </div>
          </div>
        )}

        {/* View Replies Button */}
        {comment.replyCount > 0 && !showReplies && (
          <div className="ml-8 mt-2">
            <button 
              onClick={fetchReplies}
              className="flex items-center gap-2 text-[11px] font-bold text-primary-500 hover:text-primary-600 transition-colors py-1"
            >
              <div className="w-8 border-t-2 border-primary-500/30" />
              {loadingReplies ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                `Xem ${comment.replyCount} câu trả lời`
              )}
            </button>
          </div>
        )}

        {/* Recursive Replies */}
        {showReplies && (
          <div className="ml-8 mt-3 space-y-3 border-l-2 border-gray-100 dark:border-gray-800 pl-4">
            {replies.length === 0 && <p className="text-[10px] text-text-muted italic">Đang tải hoặc không có phản hồi...</p>}
            {replies.map(reply => (
              <CommentItem 
                key={reply.id} 
                postId={postId}
                comment={reply} 
                postOwnerId={postOwnerId} 
                onDelete={onDelete}
                onReply={onReply}
              />
            ))}
            {/* Option to hide */}
            <button 
              onClick={() => setShowReplies(false)}
              className="text-[10px] font-bold text-text-muted hover:text-primary-500 transition-colors"
            >
              Ẩn câu trả lời
            </button>
          </div>
        )}
      </div>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        type="COMMENT"
        targetId={comment?.id}
      />
    </div>
  );
};

export default CommentItem;
