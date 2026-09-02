import React, { useState, useEffect } from 'react';
import { X, Heart, MessageCircle, Share2, MoreHorizontal, Send, Sparkles, ThumbsUp, Loader2, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import PostHeaderBar from './PostHeaderBar';
import PostMediaCard from './PostMediaCard';
import PostComments from './PostComments';
import PostReactionsBar from './PostReactionsBar';
import ReactionModal from '../common/ReactionModal';
import { postsApi } from '../../services/posts';
import { interactionsApi } from '../../services/interactionsApi';
import { resolveUrl, getCurrentUser } from '../../services/auth';
import { normalizeComment, normalizePost, fallbackAvatar } from '../../utils/feedNormalizers';
import { useLanguage } from '../../context/LanguageContext';
import { subscribeTopic } from '../../lib/realtime';

const PostDetailModal = ({ isOpen, onClose, post, isPlaying, onTogglePlay, onChanged }) => {
  const { t } = useLanguage();
  const [livePost, setLivePost] = useState(post);
  const [busy, setBusy] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentFocusTick, setCommentFocusTick] = useState(0);
  const [isReactionModalOpen, setIsReactionModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen && post) {
      setLivePost(post);
      fetchFullComments();

      // Socket connection
      let isMounted = true;
      let unsubscribe = null;

      const setupSocket = async () => {
        try {
          const unsub = await subscribeTopic(`/topic/posts/${post.id}`, (event) => {
            if (isMounted) handleSocketEvent(event);
          });
          
          if (!isMounted) {
            unsub();
          } else {
            unsubscribe = unsub;
          }
        } catch (err) {
          console.error('Socket subscription failed', err);
        }
      };

      setupSocket();

      return () => {
        isMounted = false;
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }
  }, [isOpen, post?.id]);

  const handleSocketEvent = (event) => {
    const currentUser = getCurrentUser()

    switch (event.eventType) {
      case 'NEW_COMMENT':
        const newComment = normalizeComment(event.payload);
        
        // Dispatch event OUTSIDE setLivePost callback
        window.dispatchEvent(new CustomEvent('soundbook_new_comment', {
          detail: { comment: newComment, postId: post.id }
        }));

        setLivePost(prev => {
          if (prev.comments?.some(c => c.id === newComment.id)) return prev;

          const isReply = newComment.parentId != null;

          if (isReply) {
            return {
              ...prev,
              comments: (prev.comments || []).map(c =>
                c.id === newComment.parentId
                  ? { ...c, replyCount: (c.replyCount || 0) + 1 }
                  : c
              ),
              reactions: {
                ...(prev.reactions || {}),
                comments: (prev.reactions?.comments || 0) + 1
              }
            };
          }

          return {
            ...prev,
            comments: [...(prev.comments || []), newComment],
            reactions: {
              ...(prev.reactions || {}),
              comments: (prev.reactions?.comments || 0) + 1
            }
          };
        });
        break;
      case 'DELETE_COMMENT':
        const deletedCommentId = event.payload.commentId;
        setLivePost(prev => ({
          ...prev,
          comments: (prev.comments || []).filter(c => c.id !== deletedCommentId),
          reactions: {
            ...(prev.reactions || {}),
            comments: Math.max(0, (prev.reactions?.comments || 0) - 1)
          }
        }));
        break;
      case 'REACT_POST':
        if (event.actorId !== currentUser?.id) {
          refreshPostInfo();
        }
        break;
      case 'REACT_COMMENT':
        const { commentId, total, types } = event.payload;
        // Dispatch event so nested reply CommentItems can also update
        window.dispatchEvent(new CustomEvent('soundbook_react_comment', {
          detail: { commentId, total, types }
        }));
        setLivePost(prev => ({
          ...prev,
          comments: (prev.comments || []).map(c =>
            c.id === commentId ? {
              ...c,
              reacts: total,
              // Preserve currentUserReaction — socket doesn't return it
              reactors: (types || []).map(t => ({ reactionType: t.toLowerCase() }))
            } : c
          )
        }));
        break;
      default:
        break;
    }
  };

  const refreshPostInfo = async () => {
    try {
      const updatedPostData = await postsApi.getPostById(post.id);
      if (updatedPostData) {
        const normalized = normalizePost(updatedPostData);
        setLivePost(prev => ({
          ...prev,
          reactions: normalized.reactions,
          currentUserReaction: normalized.currentUserReaction
        }));
      }
    } catch (err) {
      console.error('Failed to refresh post info', err);
    }
  };

  const fetchFullComments = async () => {
    if (!post?.id) {
      console.warn('Cannot fetch comments: post.id is missing');
      return;
    }
    try {
      setLoadingComments(true);
      const res = await postsApi.getComments(post.id, 0, 100);
      const rawList = res?.content || res?.data?.content || (Array.isArray(res) ? res : []);
      const totalCount = res?.totalElements ?? res?.data?.totalElements ?? rawList.length;
      const normalized = rawList.map(normalizeComment);
      const rootCount = normalized.filter(c => !c.parentId).length;
      setLivePost(prev => ({
        ...prev,
        comments: normalized,
        reactions: {
          ...(prev?.reactions || {}),
          comments: Math.max(prev?.reactions?.comments || 0, totalCount || rootCount)
        }
      }));
    } catch (err) {
      console.error(`Failed to fetch comments for post ${post.id}:`, err);
    } finally {
      setLoadingComments(false);
    }
  };

  if (!isOpen || !post) return null;

  const handleReact = async (reactionType) => {
    try {
      setBusy(true);
      const isRemoving = livePost.currentUserReaction === reactionType.toLowerCase();

      await interactionsApi.reactToPost(livePost.id, reactionType.toUpperCase());

      await refreshPostInfo();
    } catch (err) {
      console.error('Failed to react', err);
    } finally {
      setBusy(false);
    }
  };

  const handleComment = async (content, parentId = null) => {
    try {
      setBusy(true);
      const result = await interactionsApi.addComment(livePost.id, content, parentId);
      if (result) {
        const newComment = normalizeComment(result);

        // NOTE: Do NOT dispatch soundbook_new_comment here.
        // The WebSocket will broadcast NEW_COMMENT and handleSocketEvent will
        // dispatch it — dispatching twice causes duplicate comments.

        setLivePost(prev => {
          if (prev.comments?.some(c => c.id === newComment.id)) return prev;

          const isReply = parentId != null || newComment.parentId != null;

          if (isReply) {
            const actualParentId = parentId || newComment.parentId;
            return {
              ...prev,
              comments: (prev.comments || []).map(c =>
                c.id === actualParentId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c
              ),
              reactions: {
                ...(prev.reactions || {}),
                comments: (prev.reactions?.comments || 0) + 1,
              },
            };
          }

          return {
            ...prev,
            comments: [...(prev.comments || []), newComment],
            reactions: {
              ...(prev.reactions || {}),
              comments: (prev.reactions?.comments || 0) + 1,
            },
          };
        });
        onChanged?.(livePost, { action: 'comment', postId: livePost.id });
        return result;
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    // Optimistically remove from UI immediately
    setLivePost(prev => ({
      ...prev,
      comments: (prev.comments || []).filter(c => c.id !== commentId),
      reactions: {
        ...(prev.reactions || {}),
        comments: Math.max(0, (prev.reactions?.comments || 0) - 1)
      }
    }));
    try {
      await interactionsApi.deleteComment(commentId);
    } catch (err) {
      console.error('Failed to delete comment', err);
      // Re-fetch to restore state on error
      fetchFullComments();
    }
  };

  const reactions = livePost.reactions || {};
  const totalReacts = (reactions.like || 0) + (reactions.heart || 0) + (reactions.fire || 0) + (reactions.haha || 0) + (reactions.wow || 0) + (reactions.sad || 0) + (reactions.angry || 0);

  const handleClose = () => {
    if (livePost) {
      onChanged?.(livePost, { action: 'update', source: 'modal_close' });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl h-full md:h-[90vh] bg-surface-color md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 z-10">
          <div className="flex items-center gap-3">
            <Link to={`/profile/${livePost.user?.id}`} className="transition-transform active:scale-95 shrink-0">
              {livePost.user?.avatarUrl ? (
                <img src={resolveUrl(livePost.user.avatarUrl)} alt={livePost.user.name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className={`w-10 h-10 rounded-full ${livePost.user?.avatar} flex items-center justify-center text-xs font-bold text-white`}>{(livePost.user?.name || 'U').charAt(0).toUpperCase()}</div>
              )}
            </Link>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-none">Bài viết của <Link to={`/profile/${livePost.user?.id}`} className="hover:text-primary-500 transition-colors">{livePost.user?.name}</Link></h3>

              </div>
              <p className="text-[11px] text-text-muted font-medium mt-1">{livePost.user?.time || 'Vừa xong'}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col">

            {/* Caption Section */}
            {livePost.content && (
              <div className="px-6 py-4">
                <p className="text-base leading-relaxed whitespace-pre-line">{livePost.content}</p>
              </div>
            )}

            {/* Media Section */}
            {livePost.media && !livePost.sharedPost && (
              <div className="w-full bg-black flex items-center justify-center min-h-[300px] max-h-[600px]">
                <PostMediaCard post={livePost} isPlaying={isPlaying} onTogglePlay={onTogglePlay} />
              </div>
            )}

            {/* Shared Post Section */}
            {livePost.sharedPost && (
              <div className="px-6 mb-4">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Link to={`/profile/${livePost.sharedPost.authorId}`} className="flex items-center gap-2 group/author">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] text-white font-bold overflow-hidden transition-transform group-hover/author:scale-105 ${fallbackAvatar(livePost.sharedPost.authorId || livePost.sharedPost.id)}`}>
                          {livePost.sharedPost.authorAvatar ? (
                            <img src={livePost.sharedPost.authorAvatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span>{livePost.sharedPost.authorName?.[0]}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate group-hover/author:text-primary-500 transition-colors">{livePost.sharedPost.authorName}</div>
                          <div className="text-[10px] text-text-muted">
                            {livePost.sharedPost.time || 'Vừa xong'}
                          </div>
                        </div>
                      </Link>
                    </div>
                    {livePost.sharedPost.caption && (
                      <p className="text-xs mb-3 line-clamp-3 leading-relaxed text-text-color">
                        {livePost.sharedPost.caption}
                      </p>
                    )}
                    {livePost.sharedPost.thumbnail && (
                      <PostMediaCard 
                        post={{
                          type: livePost.sharedPost.type,
                          media: {
                            mediaType: livePost.sharedPost.mediaType,
                            coverUrl: resolveUrl(livePost.sharedPost.thumbnail),
                            title: livePost.sharedPost.title,
                            artist: livePost.sharedPost.artist,
                            author: livePost.sharedPost.artist,
                            id: livePost.sharedPost.metadataType === 'youtube' ? livePost.sharedPost.videoId : null,
                            ref: { 
                              id: livePost.sharedPost.metadataType === 'youtube' ? livePost.sharedPost.videoId : null 
                            }
                          }
                        }}
                        isPlaying={isPlaying}
                        onTogglePlay={onTogglePlay}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="px-6 py-1 border-b border-gray-100 dark:border-gray-800/50">
              <PostReactionsBar
                post={livePost}
                onReact={handleReact}
                onFocusComment={() => setCommentFocusTick(t => t + 1)}
                onShare={() => { /* Handle share or show toast */ }}
                onViewReactions={() => setIsReactionModalOpen(true)}
              />
            </div>

            {/* Comments Section */}
            <div className="px-6 pb-6 pt-2">
              {loadingComments ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                </div>
              ) : (
                <PostComments
                  postId={livePost.id}
                  postOwnerId={livePost.user?.userId || livePost.user?.id}
                  comments={livePost.comments || []}
                  enabled={livePost.commentsEnabled !== false}
                  onSubmitComment={handleComment}
                  onDeleteComment={handleDeleteComment}
                  focusSignal={commentFocusTick}
                  totalComments={livePost.reactions?.comments || 0}
                  showAll={true}
                />
              )}
            </div>
          </div>
        </div>

      </div>

      <ReactionModal
        isOpen={isReactionModalOpen}
        onClose={() => setIsReactionModalOpen(false)}
        targetId={livePost.id}
      />
    </div>
  );
};

export default PostDetailModal;
