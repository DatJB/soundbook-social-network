import React, { useMemo, useState, useEffect } from 'react';
import { Image, Book, Send, Music, X, AlertCircle, Smile } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { postsApi } from '../../services/posts';
import { getCurrentUser, resolveUrl } from '../../services/auth';

const POST_TYPES = [
  { value: 'BLOG', label: 'Bài viết' },
  { value: 'MUSIC_QUICK_NOTE', label: 'Âm nhạc' },
  { value: 'BOOK_REVIEW', label: 'Review sách' },
  { value: 'BOOK_READING_UPDATE', label: 'Đang đọc' },
  { value: 'BOOK_QUOTE_CARD', label: 'Trích dẫn hay' },
];

const CreatePost = ({ onCreated }) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());

  useEffect(() => {
    const handleUserUpdate = () => setCurrentUser(getCurrentUser());
    window.addEventListener('soundbook_user_updated', handleUserUpdate);
    return () => window.removeEventListener('soundbook_user_updated', handleUserUpdate);
  }, []);
  const [form, setForm] = useState({
    caption: '',
    type: 'BLOG',
    visibility: 'PUBLIC',
    moodTag: '',
    mediaUrl: '',
    mediaType: 'IMAGE',
    commentsEnabled: true,
    metadata: null, // For storing extra info like song/book details
  });

  const [activeTab, setActiveTab] = useState(null); // 'IMAGE', 'MUSIC', 'BOOK'

  // Local File State
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);

  // Search State
  const [searchType, setSearchType] = useState(null); // 'MUSIC' or 'BOOK'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);

  const canSubmit = useMemo(() => {
    const hasContent = form.caption.trim() || selectedFile || selectedMedia;
    return hasContent && !busy;
  }, [form.caption, selectedFile, selectedMedia, busy]);

  const update = (patch) => {
    setError('');
    setForm(prev => ({ ...prev, ...patch }));
  };

  const reset = () => {
    setForm({ caption: '', type: 'BLOG', visibility: 'PUBLIC', moodTag: '', mediaUrl: '', mediaType: 'IMAGE', commentsEnabled: true, metadata: null });
    setExpanded(false);
    setError('');
    setSelectedFile(null);
    setFilePreview(null);
    setSearchType(null);
    setSelectedMedia(null);
    setResults([]);
    setQuery('');
    setActiveTab(null);
  };

  const handleTypeSelect = (type) => {
    if (busy) return;
    setExpanded(true);
    setError('');
    setActiveTab(type);

    // Clear other selections
    setSelectedFile(null);
    setFilePreview(null);
    setSelectedMedia(null);
    setSearchType(null);
    setResults([]);
    setQuery('');

    if (type === 'IMAGE') {
      // Trigger file picker
      document.getElementById('post-file-input')?.click();
      update({ type: 'BLOG', mediaType: 'IMAGE' });
    } else if (type === 'MUSIC') {
      setSearchType('MUSIC');
      update({ type: 'MUSIC_QUICK_NOTE', mediaType: 'VIDEO' });
    } else if (type === 'BOOK') {
      setSearchType('BOOK');
      update({ type: 'BOOK_REVIEW', mediaType: 'BOOK' });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setSearchType(null);
      setSelectedMedia(null);
      update({ mediaType: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE' });
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

  // Real-time search (debounce)
  useEffect(() => {
    if (!searchType || !query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      handleSearch();
    }, 600); // 600ms delay

    return () => clearTimeout(timer);
  }, [query, searchType]);

  const selectMedia = (item) => {
    const isMusic = searchType === 'MUSIC';
    const title = item.snippet?.title || item.title || 'Untitled';
    // Reliably extract YouTube video ID from multiple sources
    const rawVideoId = item.id?.videoId || (typeof item.id === 'string' ? item.id : '');
    const url = rawVideoId
      ? `https://www.youtube.com/watch?v=${rawVideoId}`
      : item.previewLink || item.url || '';
    // Also try to extract from thumbnail URL as fallback
    const thumbUrl = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || item.thumbnail || '';
    const thumbMatch = thumbUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    const videoId = rawVideoId || (thumbMatch ? thumbMatch[1] : '');
    const subtitle = item.snippet?.channelTitle || (Array.isArray(item.authors) ? item.authors.join(', ') : item.authors) || '';

    // 1. Update Preview State
    setSelectedMedia({ ...item, _category: searchType });

    // 2. Update Form State (Metadata & Type)
    update({
      type: isMusic ? 'MUSIC_QUICK_NOTE' : 'BOOK_REVIEW',
      mediaUrl: url,
      metadata: {
        type: isMusic ? 'youtube' : 'google_books',
        title: title,
        subtitle: subtitle,
        artist: subtitle,
        thumbnail: thumbUrl,
        id: videoId,
        videoId: videoId,
        url: url
      }
    });

    // 3. Clear Search UI
    setResults([]);
    setSearchType(null);
    setQuery('');
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    try {
      setBusy(true);
      setError('');

      let finalMediaUrl = form.mediaUrl;

      // Handle file upload if needed
      if (selectedFile) {
        try {
          const uploadedUrl = await postsApi.uploadMedia(selectedFile);
          finalMediaUrl = uploadedUrl;
        } catch (uploadErr) {
          setError('Không thể tải tập tin lên. Vui lòng thử lại.');
          setBusy(false);
          return;
        }
      }

      const isJsonType = ['MUSIC_QUICK_NOTE', 'BOOK_READING_UPDATE', 'BOOK_QUOTE_CARD', 'BOOK_REVIEW'].includes(form.type);

      const payload = {
        type: form.type,
        caption: form.caption.trim(),
        visibility: form.visibility,
        commentsEnabled: form.commentsEnabled,
      };

      if (isJsonType) {
        if (!form.metadata && !selectedFile) {
          setError('Vui lòng chọn nội dung (nhạc hoặc sách) cho bài viết này.');
          setBusy(false);
          return;
        }

        const metadata = form.metadata || {
          type: 'manual',
          title: 'Bài viết Soundbook',
          thumbnail: finalMediaUrl,
          url: finalMediaUrl
        };

        payload.refJson = JSON.stringify(metadata);
      }

      if (finalMediaUrl) {
        payload.mediaUrl = finalMediaUrl;
        payload.mediaType = form.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
      }

      if (form.moodTag?.trim()) {
        payload.moodTag = form.moodTag.trim();
      }

      const createdPost = await postsApi.create(payload);
      reset();
      onCreated?.(createdPost);
    } catch (err) {
      setError(err?.message || 'Không thể đăng bài viết. Vui lòng kiểm tra dữ liệu và thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface-color rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 mb-6">
      <div className="flex gap-3 items-start">
        <div className="w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center font-semibold overflow-hidden flex-shrink-0">
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
        <div className="flex-1">
          <textarea
            value={form.caption}
            onChange={(event) => update({ caption: event.target.value })}
            onFocus={() => setExpanded(true)}
            rows={expanded ? 4 : 1}
            placeholder={t('feed.whats_on_your_mind')}
            className="w-full resize-none bg-gray-100 dark:bg-gray-800/50 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          {expanded ? (
            <div className="mt-4 space-y-4">
              {/* Media Preview / Selection Area */}
              {(filePreview || selectedMedia) && (
                <div className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 group">
                  {filePreview ? (
                    form.mediaType === 'VIDEO' ? (
                      <video src={filePreview} className="max-h-[400px] w-full object-contain" controls />
                    ) : (
                      <img src={filePreview} alt="Selected" className="max-h-[400px] w-full object-contain" />
                    )
                  ) : selectedMedia ? (
                    <div className="flex gap-4 p-4 items-center">
                      <img
                        src={selectedMedia.snippet?.thumbnails?.default?.url || selectedMedia.thumbnail}
                        alt="Media cover"
                        className="w-20 h-20 rounded-lg object-cover shadow-md"
                      />
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm truncate">{selectedMedia.snippet?.title || selectedMedia.title}</h4>
                        <p className="text-xs text-text-muted truncate">{selectedMedia.snippet?.channelTitle || selectedMedia.authors?.join(', ')}</p>
                        <span className="inline-block mt-2 px-2 py-0.5 bg-primary-500/10 text-primary-500 text-[10px] font-bold rounded-full uppercase tracking-wider">
                          {form.mediaType === 'VIDEO' ? 'Âm nhạc' : form.mediaType === 'BOOK' ? 'Sách' : 'Ảnh/Video'}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <button
                    onClick={() => { setSelectedFile(null); setFilePreview(null); setSelectedMedia(null); update({ mediaUrl: '', metadata: null }); }}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Search Interface */}
              {searchType && !selectedMedia && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder={searchType === 'MUSIC' ? "Tìm bài hát, nghệ sĩ..." : "Tìm tên sách, tác giả..."}
                      className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={searching || !query.trim()}
                      className="px-4 py-2 bg-primary-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                      {searching ? '...' : 'Tìm'}
                    </button>
                  </div>

                  {results.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                      {results.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => selectMedia(item)}
                          className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-left"
                        >
                          <img
                            src={item.snippet?.thumbnails?.default?.url || item.thumbnail}
                            alt="Cover"
                            className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{item.snippet?.title || item.title}</p>
                            <p className="text-xs text-text-muted truncate">{item.snippet?.channelTitle || item.authors?.join(', ')}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select value={form.type} onChange={(event) => update({ type: event.target.value })} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-900">
                  {POST_TYPES.filter(t => {
                    if (selectedFile || activeTab === 'IMAGE') return t.value === 'BLOG';
                    if (selectedMedia) {
                      const isMusic = selectedMedia._category === 'MUSIC';
                      return isMusic ? t.value === 'MUSIC_QUICK_NOTE' : ['BOOK_REVIEW', 'BOOK_READING_UPDATE', 'BOOK_QUOTE_CARD'].includes(t.value);
                    }
                    if (activeTab === 'MUSIC') return t.value === 'MUSIC_QUICK_NOTE';
                    if (activeTab === 'BOOK') return ['BOOK_REVIEW', 'BOOK_READING_UPDATE', 'BOOK_QUOTE_CARD'].includes(t.value);
                    return true;
                  }).map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <select value={form.visibility} onChange={(event) => update({ visibility: event.target.value })} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-900">
                  <option value="PUBLIC">Công khai</option>
                  <option value="FRIENDS">Bạn bè</option>
                  <option value="PRIVATE">Riêng tư</option>
                </select>
                <input value={form.moodTag} onChange={(event) => update({ moodTag: event.target.value })} placeholder="Mood/tag, ví dụ: chill, trinh thám" className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-900" />
                <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                  <input type="checkbox" checked={form.commentsEnabled} onChange={(event) => update({ commentsEnabled: event.target.checked })} />
                  Cho phép bình luận
                </label>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle size={14} /> {error}
            </div>
          ) : null}
        </div>
      </div>
      <div className="h-px bg-gray-100 dark:bg-gray-800 my-3" />
      <div className="flex justify-between items-center">
        <div className="flex gap-1 sm:gap-2">
          <input type="file" id="post-file-input" className="hidden" accept="image/*,video/*" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => handleTypeSelect('IMAGE')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${activeTab === 'IMAGE' ? 'bg-green-500/10 ring-1 ring-green-500/30' : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Image size={18} className={activeTab === 'IMAGE' ? 'text-green-600' : 'text-green-500'} />
            <span className={`text-sm font-bold hidden sm:block ${activeTab === 'IMAGE' ? 'text-green-600' : ''}`}>Ảnh/Video</span>
          </button>
          <button
            type="button"
            onClick={() => handleTypeSelect('MUSIC')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${activeTab === 'MUSIC' ? 'bg-purple-500/10 ring-1 ring-purple-500/30' : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Music size={18} className={activeTab === 'MUSIC' ? 'text-purple-600' : 'text-purple-500'} />
            <span className={`text-sm font-bold hidden sm:block ${activeTab === 'MUSIC' ? 'text-purple-600' : ''}`}>Nhạc</span>
          </button>
          <button
            type="button"
            onClick={() => handleTypeSelect('BOOK')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${activeTab === 'BOOK' ? 'bg-orange-500/10 ring-1 ring-orange-500/30' : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Book size={18} className={activeTab === 'BOOK' ? 'text-orange-600' : 'text-orange-500'} />
            <span className={`text-sm font-bold hidden sm:block ${activeTab === 'BOOK' ? 'text-orange-600' : ''}`}>Sách</span>
          </button>

          {/* Emoji Picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all cursor-pointer ${showEmojiPicker ? 'bg-yellow-500/10 ring-1 ring-yellow-500/30 text-yellow-600' : 'text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Smile size={18} className={showEmojiPicker ? 'text-yellow-600' : 'text-yellow-500'} />
              <span className="text-sm font-bold hidden sm:block">Emoji</span>
            </button>

            {showEmojiPicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                <div className="absolute top-full left-0 mt-3 z-20 shadow-2xl rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                  <EmojiPicker
                    onEmojiClick={(emojiObject) => {
                      setForm(prev => ({ ...prev, caption: prev.caption + emojiObject.emoji }));
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
        </div>
        <div className="flex items-center gap-2">
          {expanded ? <button type="button" onClick={reset} className="rounded-lg px-3 py-2 text-sm font-semibold text-text-muted hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button> : null}
          <button disabled={!canSubmit || busy} onClick={submit} className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-primary-500/20">
            <Send size={16} />
            {busy ? 'Đang đăng...' : t('feed.post_button')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePost;
