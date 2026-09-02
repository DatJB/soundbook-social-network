import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  Search,
  Sun,
  Moon,
  MessageCircle,
  User,
  LogOut,
  Music,
  BookOpen,
  FileText,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getCurrentUser, logout, resolveHomePath, resolveUrl } from '../../services/auth';
import { searchApi } from '../../services/search';
import NotificationDropdown from './NotificationDropdown';

const ResultAvatar = ({ user }) => {
  if (user?.avatarUrl) {
    return <img src={resolveUrl(user.avatarUrl)} alt={user.displayName || 'avatar'} className="h-8 w-8 rounded-full object-cover" />;
  }
  return <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold">{(user?.displayName || 'U').charAt(0).toUpperCase()}</div>;
};

const Header = ({ unreadMessages = 0 }) => {
  const { theme, toggleTheme } = useTheme();
  const { t, language, toggleLanguage } = useLanguage();
  const navigate = useNavigate();

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState({ users: [], posts: [], music: [], books: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());

  const searchRef = useRef(null);
  const profileMenuRef = useRef(null);

  const userName = currentUser?.displayName || 'Soundbook User';
  const userUsername = currentUser?.username ? `@${currentUser.username}` : '';

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchFocused(false);
      }



      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSearchFocused(false);
        setShowProfileMenu(false);
      }
    };

    const handleUserUpdate = () => {
      setCurrentUser(getCurrentUser());
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('soundbook_user_updated', handleUserUpdate);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('soundbook_user_updated', handleUserUpdate);
    };
  }, []);

  useEffect(() => {
    const keyword = searchQuery.trim();
    if (!keyword) {
      setSearchResult({ users: [], posts: [], music: [], books: [] });
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        const data = await searchApi.search(keyword, 5);
        if (!cancelled) {
          setSearchResult({
            users: data?.users || [],
            posts: data?.posts || [],
            music: data?.music || [],
            books: data?.books || [],
          });
        }
      } catch {
        if (!cancelled) {
          setSearchResult({ users: [], posts: [], music: [], books: [] });
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);



  const handleToggleProfileMenu = () => {
    setShowProfileMenu((prev) => !prev);
  };

  const handleLogout = async () => {
    setShowProfileMenu(false);

    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const closeSearch = () => {
    setIsSearchFocused(false);
  };

  const homePath = resolveHomePath(currentUser?.role);
  const profilePath = currentUser?.id ? `/profile/${currentUser.id}` : '/profile/me';
  const showSearchDropdown = isSearchFocused && searchQuery.trim().length > 0;
  const hasSearchResults = searchResult.users.length || searchResult.posts.length || searchResult.music.length || searchResult.books.length;

  return (
      <header className="sticky top-0 z-50 w-full bg-surface-color border-b border-gray-200 dark:border-gray-800 shadow-sm transition-colors duration-300">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-3">
            <div className="flex-shrink-0 flex items-center gap-2">
              <Link
                  to={homePath}
                  className="flex items-center gap-2 outline-none rounded-md focus-visible:ring-2 focus-visible:ring-primary-500"
                  aria-label={t('app.name')}
              >
                <img src="/sb.png" alt="Soundbook Logo" className="w-9 h-9 object-contain dark:animate-pulse" />
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary-500 to-purple-500 bg-clip-text text-transparent hidden sm:block">
                {t('app.name')}
              </span>
              </Link>
            </div>

            <div ref={searchRef} className="flex-1 max-w-2xl px-2 sm:px-4 mx-auto relative">
              <div
                  className={`relative flex items-center w-full h-10 rounded-full bg-gray-100 dark:bg-gray-800 border transition-all duration-300 ${
                      isSearchFocused ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-transparent'
                  }`}
              >
                <div className="pl-4 pr-2 text-gray-400" aria-hidden="true">
                  <Search size={18} />
                </div>

                <input
                    type="text"
                    className="w-full h-full bg-transparent border-none outline-none text-sm px-2 text-text-color placeholder-gray-400"
                    placeholder="Tìm người dùng, bài viết, nhạc, sách..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    aria-label={t('common.search')}
                    aria-expanded={showSearchDropdown}
                    aria-controls="header-search-dropdown"
                />
              </div>

              {showSearchDropdown && (
                  <div
                      id="header-search-dropdown"
                      role="listbox"
                      className="absolute top-12 left-2 right-2 sm:left-4 sm:right-4 bg-surface-color rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden transform opacity-100 scale-100 transition-all duration-200 origin-top max-h-[70vh] overflow-y-auto"
                  >
                    <div className="p-2">
                      {searchLoading ? (
                        <div className="p-4 text-center text-sm text-text-muted">Đang tìm kiếm...</div>
                      ) : null}

                      {!searchLoading && !hasSearchResults ? (
                        <div className="p-4 text-center text-sm text-text-muted">Không tìm thấy kết quả phù hợp.</div>
                      ) : null}

                      {searchResult.users.length ? (
                        <>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 p-2 uppercase tracking-wider">Người dùng</div>
                          {searchResult.users.map((user) => (
                            <Link key={user.userId} to={`/profile/${user.userId}`} onClick={closeSearch} className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg w-full text-left">
                              <ResultAvatar user={user} />
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{user.displayName} <span className="text-xs text-primary-500">{Math.round(user.matchScore || 0)}% Match</span></div>
                                <div className="text-xs text-text-muted truncate">{user.username || user.bio || 'Soundbook user'}</div>
                              </div>
                            </Link>
                          ))}
                        </>
                      ) : null}

                      {searchResult.posts.length ? (
                        <>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 p-2 uppercase tracking-wider mt-2">Bài viết</div>
                          {searchResult.posts.map((post) => (
                            <Link key={post.id} to={`/profile/${post.user?.userId || currentUser?.id}`} onClick={closeSearch} className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg w-full text-left">
                              <div className="w-8 h-8 rounded-md bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-primary-500"><FileText size={15} /></div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{post.media?.title || post.caption || 'Bài viết Soundbook'}</div>
                                <div className="text-xs text-text-muted truncate">{post.user?.displayName} · {post.reason || post.caption}</div>
                              </div>
                            </Link>
                          ))}
                        </>
                      ) : null}

                      {searchResult.music.length ? (
                        <>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 p-2 uppercase tracking-wider mt-2">Âm nhạc</div>
                          {searchResult.music.map((item) => (
                            <Link key={`music-${item.id}`} to={`/profile/${item.ownerUserId}`} onClick={closeSearch} className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg w-full text-left">
                              {item.coverUrl ? <img src={item.coverUrl} alt={item.title} className="w-8 h-8 rounded-md object-cover" /> : <div className="w-8 h-8 rounded-md bg-purple-500 flex items-center justify-center text-white"><Music size={14} /></div>}
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{item.title}</div>
                                <div className="text-xs text-text-muted truncate">{item.subtitle || item.ownerDisplayName}</div>
                              </div>
                            </Link>
                          ))}
                        </>
                      ) : null}

                      {searchResult.books.length ? (
                        <>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 p-2 uppercase tracking-wider mt-2">Sách / truyện</div>
                          {searchResult.books.map((item) => (
                            <Link key={`book-${item.id}`} to={`/profile/${item.ownerUserId}`} onClick={closeSearch} className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg w-full text-left">
                              {item.coverUrl ? <img src={item.coverUrl} alt={item.title} className="w-7 h-9 rounded-sm object-cover" /> : <div className="w-7 h-9 rounded-sm bg-orange-500 flex items-center justify-center text-white"><BookOpen size={13} /></div>}
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{item.title}</div>
                                <div className="text-xs text-text-muted truncate">{item.subtitle || item.ownerDisplayName}</div>
                              </div>
                            </Link>
                          ))}
                        </>
                      ) : null}
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-3 text-center text-sm text-primary-500 font-medium border-t border-gray-200 dark:border-gray-800">
                      Kết quả cho "{searchQuery}"
                    </div>
                  </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <button type="button" onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500" title={t('header.toggle_theme')} aria-label={t('header.toggle_theme')}>
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>

              <div className="px-2.5 py-1 h-9 rounded-full text-gray-600 dark:text-gray-300 font-semibold text-xs tracking-wider border border-gray-200 dark:border-gray-700 uppercase flex items-center justify-center select-none" title="Tiếng Việt" aria-label="Ngôn ngữ: Tiếng Việt">
                VI
              </div>

              <Link to="/chat" className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500" title={t('header.messages')} aria-label={t('header.messages')}>
                <MessageCircle size={20} />
                {unreadMessages > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none border border-white dark:border-gray-900">{unreadMessages}</span>
                )}
              </Link>

              <NotificationDropdown />


              <div ref={profileMenuRef} className="relative">
                <button type="button" onClick={handleToggleProfileMenu} className="flex items-center gap-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500" aria-haspopup="menu" aria-expanded={showProfileMenu}>
                  <div className="w-9 h-9 rounded-full bg-primary-500 text-white flex items-center justify-center font-semibold overflow-hidden">
                    {currentUser?.avatarUrl ? (
                      <img 
                        src={`${resolveUrl(currentUser.avatarUrl)}${String(currentUser.avatarUrl).includes('?') ? '&' : '?'}t=${currentUser.updatedAt || 'initial'}`} 
                        alt={userName} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <span>{userName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </button>

                {showProfileMenu && (
                    <div role="menu" className="absolute top-12 right-0 w-72 max-w-[calc(100vw-2rem)] bg-surface-color rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden transform opacity-100 scale-100 transition-all duration-200 origin-top-right">
                      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                        <div className="font-semibold text-sm">{userName}</div>
                        {userUsername && <div className="text-xs text-text-muted">{userUsername}</div>}
                      </div>

                      <div className="p-2">
                        <Link to={profilePath} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onClick={() => setShowProfileMenu(false)}>
                          <User size={18} />
                          <span>{t('header.view_profile')}</span>
                        </Link>

                        <button type="button" onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left text-red-500">
                          <LogOut size={18} />
                          <span>{t('header.logout')}</span>
                        </button>
                      </div>
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
  );
};

export default Header;
