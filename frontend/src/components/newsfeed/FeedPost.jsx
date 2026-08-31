import { Lock, MoreHorizontal, Pencil, Sparkles, Trash2, MessageSquareOff, Send, Flag, Smile, Image, Music, Book, Search, Loader2, X, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmojiPicker from 'emoji-picker-react';
import { useTheme } from '../../context/ThemeContext';
import PostHeaderBar from './PostHeaderBar';
import PostMediaCard from './PostMediaCard';
import PostReactionsBar from './PostReactionsBar';
import PostComments from './PostComments';
import { postsApi } from '../../services/posts';
import { interactionsApi } from '../../services/interactionsApi';
import ModalShell from '../common/ModalShell';
import ConfirmDialog from '../common/ConfirmDialog';
import ReportModal from '../common/ReportModal';
import ReactionModal from '../common/ReactionModal';
import { normalizeComment, normalizePost, fallbackAvatar } from '../../utils/feedNormalizers';
import { resolveUrl } from '../../services/auth';
import { useRef, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import PostDetailModal from './PostDetailModal';
import PostAiInsight from './PostAiInsight';

const toApiType = (type) => {
  if (type === 'audio') return 'MUSIC_QUICK_NOTE';
  if (type === 'book_review') return 'BOOK_REVIEW';
  return 'BLOG';
};

const FeedPost = ({ post, isPlaying, onTogglePlay, onChanged, onDeleted, onShared }) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const [livePost, setLivePost] = useState(post);
  const comments = livePost.comments || [];
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [commentFocusTick, setCommentFocusTick] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isReactionModalOpen, setIsReactionModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [shareForm, setShareForm] = useState({
    caption: 'Mình muốn chia sẻ bài viết này với mọi người.',
    visibility: 'PUBLIC',
  });
  const [editForm, setEditForm] = useState({
    caption: post.content || '',
    visibility: post.original?.visibility || 'PUBLIC',
    moodTag: post.original?.moodTag || '',
    mediaUrl: post.media?.coverUrl || '',
    mediaType: post.media?.type || 'IMAGE',
    commentsEnabled: post.commentsEnabled !== false,
    metadata: post.original?.metadata || null,
  });
  const [showEmojiPickerEdit, setShowEmojiPickerEdit] = useState(false);
  const [showEmojiPickerShare, setShowEmojiPickerShare] = useState(false);

  // Media Edit States
  const [searchType, setSearchType] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);

  useEffect(() => {
    setLivePost(post);
    setEditForm({
      caption: post.content || '',
      visibility: post.original?.visibility || 'PUBLIC',
      moodTag: post.original?.moodTag || '',
      mediaUrl: post.media?.coverUrl || '',
      mediaType: post.media?.type || 'IMAGE',
      commentsEnabled: post.commentsEnabled !== false,
      metadata: post.original?.metadata || null,
    });
    setSelectedFile(null);
    setFilePreview(null);
    setSearchType(null);
  }, [post]);

  const setUpdatedPost = (data, meta = { action: 'update' }) => {
    // If data is already normalized (it should have a user object with a name property instead of displayName)
    // Or just check if it's the result of normalizePost already
    const normalized = (data?.user && 'name' in data.user) ? data : normalizePost(data);
    setLivePost(normalized);
    onChanged?.(normalized, meta);
    return normalized;
  };

  const runAction = async (action, { keepMenu = false } = {}) => {
    if (busy) return null;
    try {
      setBusy(true);
      setActionError('');
      const result = await action();
      return result;
    } catch (err) {
      setActionError(err?.message || 'Thao tác không thành công. Vui lòng thử lại.');
      return null;
    } finally {
      setBusy(false);
      if (!keepMenu) setMenuOpen(false);
    }
  };

  const handleReact = async (reactionType) => {
    // Ensure uppercase for backend
    const apiType = String(reactionType).toUpperCase();
    await runAction(async () => {
      await interactionsApi.reactToPost(livePost.id, apiType);

      // Since interactionsApi returns void, we refresh the post info to get new counts
      // We can use postsApi.getPostById which we just added
      const updated = await postsApi.getPostById(livePost.id);
      if (updated) setUpdatedPost(updated);
    });
  };

  const handleComment = async (content, parentId = null) => {
    const result = await runAction(() => interactionsApi.addComment(livePost.id, content, parentId), { keepMenu: true });
    if (!result) return;
    const newComment = normalizeComment(result);
    setLivePost(prev => ({
      ...prev,
      comments: [...(prev.comments || []), newComment],
      reactions: {
        ...(prev.reactions || {}),
        comments: (prev.reactions?.comments || 0) + 1,
      },
    }));
    onChanged?.(newComment, { action: 'comment', postId: livePost.id });
    return result;
  };

  const handleDeleteComment = (commentId) => {
    setLivePost(prev => ({
      ...prev,
      comments: (prev.comments || []).filter(c => c.id !== commentId),
      reactions: {
        ...(prev.reactions || {}),
        comments: Math.max(0, (prev.reactions?.comments || 0) - 1),
      },
    }));
  };

  const submitShare = async () => {
    const caption = shareForm.caption.trim();
    const result = await runAction(() => postsApi.share(livePost.id, {
      caption: caption || 'Đã chia sẻ một bài viết trên Soundbook.',
      visibility: shareForm.visibility,
    }));
    if (!result) return;
    setLivePost(prev => ({
      ...prev,
      reactions: {
        ...(prev.reactions || {}),
        shares: (prev.reactions?.shares || 0) + 1,
      },
    }));
    onShared?.(result);
    setShareOpen(false);
    setShareForm({ caption: 'Mình muốn chia sẻ bài viết này với mọi người.', visibility: 'PUBLIC' });
  };

  const handleDelete = async () => {
    const result = await runAction(() => postsApi.remove(livePost.id));
    if (result !== null) {
      setDeleteOpen(false);
      onDeleted?.(livePost.id);
    }
  };

  const handleToggleComments = async () => {
    const result = await runAction(() => postsApi.toggleComments(livePost.id, !(livePost.commentsEnabled !== false)));
    if (result) setUpdatedPost(result);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setSearchType(null);
      setEditForm(prev => ({ ...prev, mediaType: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE', metadata: null }));
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    try {
      setSearching(true);
      if (searchType === 'MUSIC') {
        const { searchYouTubeVideos } = await import('../../services/youtube');
        const data = await searchYouTubeVideos(query);
        setResults(data);
      } else {
        const { searchGoogleBooks, normalizeBook } = await import('../../services/books');
        const data = await searchGoogleBooks(query);
        setResults(data.map(normalizeBook));
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!searchType || !query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => handleSearch(), 600);
    return () => clearTimeout(timer);
  }, [query, searchType]);

  const selectMedia = (item) => {
    const isMusic = searchType === 'MUSIC';
    const title = item.snippet?.title || item.title || 'Untitled';
    const rawVideoId = item.id?.videoId || (typeof item.id === 'string' ? item.id : '');
    const url = rawVideoId ? `https://www.youtube.com/watch?v=${rawVideoId}` : item.previewLink || item.url || '';
    const thumbUrl = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || item.thumbnail || '';
    const thumbMatch = thumbUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    const videoId = rawVideoId || (thumbMatch ? thumbMatch[1] : '');
    const subtitle = item.snippet?.channelTitle || (Array.isArray(item.authors) ? item.authors.join(', ') : item.authors) || '';

    setEditForm(prev => ({
      ...prev,
      mediaUrl: url,
      mediaType: isMusic ? 'VIDEO' : 'IMAGE',
      metadata: {
        type: isMusic ? 'youtube' : 'google_books',
        title,
        subtitle,
        artist: subtitle,
        thumbnail: thumbUrl,
        id: videoId,
        videoId,
        url
      }
    }));
    setSelectedFile(null);
    setFilePreview(null);
    setResults([]);
    setSearchType(null);
    setQuery('');
  };

  const saveEdit = async () => {
    let finalMediaUrl = editForm.mediaUrl;

    if (selectedFile) {
      try {
        setBusy(true);
        const uploadedUrl = await postsApi.uploadMedia(selectedFile);
        finalMediaUrl = uploadedUrl;
      } catch (err) {
        setActionError('Không thể tải tập tin lên.');
        setBusy(false);
        return;
      }
    }

    const payload = {
      caption: editForm.caption,
      visibility: editForm.visibility,
      moodTag: editForm.moodTag,
      mediaUrl: finalMediaUrl,
      mediaType: editForm.mediaType,
      commentsEnabled: editForm.commentsEnabled,
    };

    if (editForm.metadata) {
      payload.refJson = JSON.stringify(editForm.metadata);
    }

    const result = await runAction(() => postsApi.update(livePost.id, payload));
    if (result) {
      setUpdatedPost(result);
      setEditing(false);
    }
  };

  return (
    <div
      id={`post-${livePost.id}`}
      className="bg-surface-color rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-200 dark:border-gray-800 transition-all duration-300 scroll-mt-24"
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0 overflow-hidden">
          <PostHeaderBar post={livePost} />
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => setIsAiOpen(true)}
            title={t?.('ai.summary_title') || 'Soundbook AI'}
            className="text-text-muted hover:text-primary-500 p-2 rounded-xl hover:bg-primary-500/10 transition-colors"
          >
            <Sparkles size={18} />
          </button>

          <div className="relative">
            <button onClick={() => setMenuOpen(prev => !prev)} className="rounded-full p-2 text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800">
              <MoreHorizontal size={20} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                {livePost.canEdit ? (
                  <>
                    <button onClick={() => { setEditing(true); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil size={15} /> Sửa bài viết</button>
                    <button onClick={handleToggleComments} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gray-100 disabled:opacity-60 dark:hover:bg-gray-800"><MessageSquareOff size={15} /> {livePost.commentsEnabled !== false ? 'Đóng bình luận' : 'Mở bình luận'}</button>
                    <button onClick={() => { setDeleteOpen(true); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 size={15} /> Xóa bài viết</button>
                  </>
                ) : (
                  <button
                    onClick={() => { setMenuOpen(false); setIsReportModalOpen(true); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-rose-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Flag size={15} /> {t('post.report', { defaultValue: 'Báo cáo bài viết' })}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {livePost.reason ? (
        <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-primary-500/10 px-3 py-1 text-xs font-semibold text-primary-500">
          <Sparkles size={13} />
          <span className="truncate">{livePost.reason}</span>
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-950/30 dark:text-red-300">
          {actionError}
        </div>
      ) : null}

      <div
        className="cursor-pointer group/post"
        onClick={(e) => {
          // Don't open if clicking on a link or button inside (though there are few here)
          if (e.target.closest('button, a')) return;
          setIsDetailOpen(true);
        }}
      >
        {livePost.content &&
          livePost.content.trim().toLowerCase() !== (livePost.reason || '').trim().toLowerCase() && (
            <p className="text-sm mb-4 leading-relaxed whitespace-pre-line group-hover/post:text-primary-500 transition-colors">{livePost.content}</p>
          )}

        {!livePost.sharedPost && <PostMediaCard post={livePost} isPlaying={isPlaying} onTogglePlay={onTogglePlay} />}

        {livePost.sharedPost && (
          <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
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
                      // Only provide video ID if it's actually a YouTube reference
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
        )}
      </div>

      {livePost.commentsEnabled === false ? <div className="mb-2 mt-3 flex items-center gap-2 text-xs text-text-muted"><Lock size={13} /> Bình luận đang đóng</div> : null}

      <PostReactionsBar post={livePost} onReact={handleReact} onFocusComment={() => setIsDetailOpen(true)} onShare={() => setShareOpen(true)} onViewReactions={() => setIsReactionModalOpen(true)} />



      <ModalShell
        open={shareOpen}
        title="Chia sẻ bài viết"
        description="Viết vài dòng cảm nghĩ trước khi chia sẻ bài viết."
        onClose={() => setShareOpen(false)}
        footer={(
          <>
            <div className="flex-1 flex justify-start relative">
              <button
                type="button"
                onClick={() => setShowEmojiPickerShare(!showEmojiPickerShare)}
                className={`p-2 rounded-lg transition-colors ${showEmojiPickerShare ? 'bg-yellow-500/10 text-yellow-600' : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <Smile size={18} />
              </button>
              {showEmojiPickerShare && (
                <>
                  <div className="fixed inset-0 z-[110]" onClick={() => setShowEmojiPickerShare(false)} />
                  <div className="absolute bottom-full left-0 mb-2 z-[120] shadow-2xl rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                    <EmojiPicker
                      onEmojiClick={(emojiObject) => {
                        setShareForm(prev => ({ ...prev, caption: prev.caption + emojiObject.emoji }));
                        setShowEmojiPickerShare(false);
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
            <button type="button" onClick={() => setShareOpen(false)} disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-text-muted hover:bg-gray-100 disabled:opacity-60 dark:hover:bg-gray-800">Hủy</button>
            <button type="button" onClick={submitShare} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
              <Send size={15} /> {busy ? 'Đang chia sẻ...' : 'Chia sẻ'}
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <textarea
            value={shareForm.caption}
            onChange={(event) => setShareForm(prev => ({ ...prev, caption: event.target.value }))}
            rows={4}
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
            placeholder="Bạn muốn nói gì về bài viết này?"
          />
          <select
            value={shareForm.visibility}
            onChange={(event) => setShareForm(prev => ({ ...prev, visibility: event.target.value }))}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="PUBLIC">Công khai</option>
            <option value="FRIENDS">Bạn bè</option>
            <option value="PRIVATE">Riêng tư</option>
          </select>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-text-muted dark:border-gray-700 dark:bg-gray-800/70">
            Chia sẻ từ: <span className="font-semibold text-text-color">{livePost.user?.name}</span> — {livePost.content?.slice(0, 120)}
          </div>
        </div>
      </ModalShell>

      <ConfirmDialog
        open={deleteOpen}
        danger
        title="Xóa bài viết"
        message="Bạn chắc chắn muốn xóa bài viết này? Thao tác này sẽ xóa bình luận, cảm xúc và media liên quan."
        confirmLabel="Xóa bài"
        busy={busy}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        type="POST"
        targetId={livePost.id}
      />

      <ReactionModal
        isOpen={isReactionModalOpen}
        onClose={() => setIsReactionModalOpen(false)}
        targetId={livePost.id}
      />

      <ModalShell
        open={editing}
        title="Chỉnh sửa bài viết"
        description="Cập nhật lại nội dung hoặc cài đặt cho bài viết của bạn."
        onClose={() => setEditing(false)}
        footer={(
          <>
            <div className="flex-1 flex justify-start items-center gap-3 relative">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                <div className="w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center text-[10px] text-white font-bold overflow-hidden">
                  {livePost.user?.avatarUrl ? <img src={livePost.user.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span>{livePost.user?.name?.[0]}</span>}
                </div>
                <span className="text-xs font-bold truncate max-w-[100px]">{livePost.user?.name}</span>
              </div>
              <div className="h-6 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1" />
              <button
                type="button"
                onClick={() => setShowEmojiPickerEdit(!showEmojiPickerEdit)}
                className={`p-2 rounded-lg transition-colors ${showEmojiPickerEdit ? 'bg-yellow-500/10 text-yellow-600' : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <Smile size={18} />
              </button>
              {showEmojiPickerEdit && (
                <>
                  <div className="fixed inset-0 z-[110]" onClick={() => setShowEmojiPickerEdit(false)} />
                  <div className="absolute bottom-full left-0 mb-2 z-[120] shadow-2xl rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                    <EmojiPicker
                      onEmojiClick={(emojiObject) => {
                        setEditForm(prev => ({ ...prev, caption: prev.caption + emojiObject.emoji }));
                        setShowEmojiPickerEdit(false);
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
            <button onClick={() => setEditing(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Hủy</button>
            <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 hover:bg-primary-600 transition-colors shadow-lg shadow-primary-500/20">{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted ml-1">Nội dung bài viết</label>
            <textarea
              value={editForm.caption}
              onChange={(event) => setEditForm(prev => ({ ...prev, caption: event.target.value }))}
              rows={5}
              className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900 transition-all"
              placeholder="Bạn đang nghĩ gì?"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted ml-1">Quyền riêng tư</label>
              <select
                value={editForm.visibility}
                onChange={(event) => setEditForm(prev => ({ ...prev, visibility: event.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900 transition-all"
              >
                <option value="PUBLIC">Công khai</option>
                <option value="FRIENDS">Bạn bè</option>
                <option value="PRIVATE">Riêng tư</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted ml-1">Tâm trạng / Thẻ</label>
              <input
                value={editForm.moodTag}
                onChange={(event) => setEditForm(prev => ({ ...prev, moodTag: event.target.value }))}
                placeholder="Mood/tag"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted ml-1">Hình ảnh / Nhạc / Sách</label>
            <div className="flex gap-2">
              <label className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-bold text-text-muted cursor-pointer hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 transition-all">
                <Image size={18} className="text-emerald-500" />
                <span className="hidden sm:inline">Ảnh / Video</span>
                <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileChange} />
              </label>
              <button
                type="button"
                onClick={() => setSearchType(searchType === 'MUSIC' ? null : 'MUSIC')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all ${searchType === 'MUSIC' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-200 bg-gray-50 text-text-muted hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900'}`}
              >
                <Music size={18} className="text-blue-500" />
                <span className="hidden sm:inline">Nhạc</span>
              </button>
              <button
                type="button"
                onClick={() => setSearchType(searchType === 'BOOK' ? null : 'BOOK')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all ${searchType === 'BOOK' ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-gray-200 bg-gray-50 text-text-muted hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900'}`}
              >
                <Book size={18} className="text-orange-500" />
                <span className="hidden sm:inline">Sách</span>
              </button>
            </div>
          </div>

          {searchType && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchType === 'MUSIC' ? "Tìm bài hát trên Youtube..." : "Tìm sách trên Google Books..."}
                  className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary-500" size={16} />}
              </div>

              {results.length > 0 && (
                <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950 custom-scrollbar">
                  {results.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectMedia(item)}
                      className="flex w-full items-center gap-3 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors border-b border-gray-50 dark:border-gray-900 last:border-0"
                    >
                      <img
                        src={item.snippet?.thumbnails?.default?.url || item.thumbnail || 'https://via.placeholder.com/40'}
                        className="h-10 w-10 rounded-lg object-cover bg-gray-100"
                        alt=""
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-bold">{item.snippet?.title || item.title}</div>
                        <div className="truncate text-xs text-text-muted">{item.snippet?.channelTitle || (Array.isArray(item.authors) ? item.authors.join(', ') : item.authors)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(filePreview || editForm.mediaUrl || editForm.metadata) && !searchType && (
            <div className="relative group rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-black">
              {editForm.metadata ? (
                <div className="flex items-center gap-4 p-4 bg-white dark:bg-gray-900">
                  <img src={editForm.metadata.thumbnail} className="w-16 h-16 rounded-lg object-cover shadow-md" alt="" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-primary-500 uppercase tracking-wider mb-1">{editForm.metadata.type === 'youtube' ? 'Đang chọn nhạc' : 'Đang chọn sách'}</div>
                    <div className="text-sm font-bold truncate">{editForm.metadata.title}</div>
                    <div className="text-xs text-text-muted truncate">{editForm.metadata.subtitle || editForm.metadata.artist}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(prev => ({ ...prev, mediaUrl: '', metadata: null }))}
                    className="p-2 text-text-muted hover:text-red-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <>
                  {editForm.mediaType === 'VIDEO' ? (
                    <video src={filePreview || editForm.mediaUrl} className="w-full max-h-60 object-contain" controls />
                  ) : (
                    <img src={filePreview || editForm.mediaUrl} className="w-full max-h-60 object-contain" alt="Preview" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setFilePreview(null);
                      setEditForm(prev => ({ ...prev, mediaUrl: '', metadata: null }));
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-red-500 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <X size={16} />
                  </button>
                </>
              )}
            </div>
          )}

          <label className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <input
              type="checkbox"
              checked={editForm.commentsEnabled}
              onChange={(event) => setEditForm(prev => ({ ...prev, commentsEnabled: event.target.checked }))}
              className="w-4 h-4 rounded text-primary-500 focus:ring-primary-500"
            />
            <span className="text-sm font-medium">Cho phép mọi người bình luận</span>
          </label>
        </div>
      </ModalShell>

      <PostDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        post={livePost}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        onChanged={setUpdatedPost}
      />

      <PostAiInsight
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        post={livePost}
      />
    </div>
  );
};

export default FeedPost;
