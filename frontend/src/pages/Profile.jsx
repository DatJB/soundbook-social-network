import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { AlertCircle, Grid3X3, List, Save, X, Camera, Search, Loader2 } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { useLanguage } from '../context/LanguageContext';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';

import ProfileHeader from '../components/profile/ProfileHeader';
import PersonalInfo from '../components/profile/PersonalInfo';
import AccountInfo from '../components/profile/AccountInfo';
import FriendsList from '../components/profile/FriendsList';
import FollowersList from '../components/profile/FollowersList';
import TasteSummaryCard from '../components/taste/TasteSummaryCard';
import ProfileShelves from '../components/profile/ProfileShelves';
import ProfilePosts from '../components/profile/ProfilePosts';
import ModalShell from '../components/common/ModalShell';
import ConfirmDialog from '../components/common/ConfirmDialog';
import ToastMessage from '../components/common/ToastMessage';
import ReportModal from '../components/common/ReportModal';
import { useMusicPlayer } from '../context/MusicPlayerContext';
import { getCurrentUser, logout, resolveHomePath, resolveUrl, updateStoredUser } from '../services/auth';
import { profileApi } from '../services/profile';
import { searchYouTubeVideos, getYouTubeVideoDetails } from '../services/youtube';
import { searchGoogleBooks, normalizeBook } from '../services/books';
import { friendsApi } from '../services/friends';
import { fallbackAvatar, normalizePost, normalizeShelfItem } from '../utils/feedNormalizers';

const emptyMediaForm = { url: '' };
const emptyMusicForm = { title: '', subtitle: '', coverUrl: '', itemId: '', itemType: 'PLAYLIST', visibility: 'PUBLIC' };
const emptyBookForm = { title: '', author: '', coverUrl: '', rating: 5, progressPercent: 0, shelfCode: 'WILL_READ', visibility: 'PUBLIC' };

const extractYouTubeId = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const watchMatch = raw.match(/[?&]v=([^&]+)/);
  if (watchMatch?.[1]) return watchMatch[1];
  const shortMatch = raw.match(/youtu\.be\/([^?&/]+)/);
  if (shortMatch?.[1]) return shortMatch[1];
  const embedMatch = raw.match(/youtube\.com\/embed\/([^?&/]+)/);
  if (embedMatch?.[1]) return embedMatch[1];
  return raw;
};

const Profile = () => {
  const { t } = useLanguage();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const targetPostId = searchParams.get('post');
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const { currentTrack, isPlaying: globalIsPlaying, playTrack, stopTrack } = useMusicPlayer();
  const [viewMode, setViewMode] = useState('shelf');
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [mediaModal, setMediaModal] = useState({ open: false, kind: 'avatar' });
  const fileInputRef = useRef(null);

  // Cropping State
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [copyModal, setCopyModal] = useState({ open: false, url: '' });
  const [shelfModal, setShelfModal] = useState({ open: false, mode: 'add', shelfId: 'playlists', item: null, form: emptyMusicForm });
  const [deleteShelf, setDeleteShelf] = useState(null);
  const [pinnedVideoDetails, setPinnedVideoDetails] = useState(null);
  const [pinnedModal, setPinnedModal] = useState({ open: false, query: '', loading: false, results: [], error: '' });
  const [shelfSearch, setShelfSearch] = useState({ query: '', loading: false, results: [], error: '' });
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
  const [followerSearch, setFollowerSearch] = useState({ query: '', loading: false, results: [] });

  const targetId = id || 'me';
  const isGuest = Boolean(profile && currentUser?.id && String(profile.userId) !== String(currentUser.id));

  const showNotice = useCallback((type, message, title) => setNotice({ type, message, title }), []);

  const loadProfile = useCallback(async () => {
    const data = await profileApi.getProfile(targetId);
    setProfile(data);
    return data;
  }, [targetId]);

  const fetchFollowers = async () => {
    try {
      const data = await profileApi.getFollowers(targetId);
      setFollowers(data);
      setFollowerSearch(prev => ({ ...prev, results: data }));
    } catch (err) {
      console.error('Failed to load followers:', err);
    }
  };

  useEffect(() => {
    if (!isFollowersModalOpen) {
      setFollowerSearch({ query: '', loading: false, results: [] });
      return;
    }

    if (!followerSearch.query.trim()) {
      setFollowerSearch(prev => ({ ...prev, results: followers }));
      return;
    }

    const handler = setTimeout(async () => {
      setFollowerSearch(prev => ({ ...prev, loading: true }));
      try {
        const results = await profileApi.searchFollowers(targetId, followerSearch.query);
        setFollowerSearch(prev => ({ ...prev, results, loading: false }));
      } catch (err) {
        setFollowerSearch(prev => ({ ...prev, loading: false }));
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [followerSearch.query, isFollowersModalOpen, followers, targetId]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setIsLoading(true);
        setError('');
        await Promise.all([loadProfile(), fetchFollowers()]);
      } catch (err) {
        if (mounted) setError(err?.message || 'Không thể tải trang cá nhân.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    run();
    return () => { mounted = false; };
  }, [targetId, loadProfile]);

  const [formData, setFormData] = useState({ username: '', bio: '', publicInfo: '', bioVisibility: 'PUBLIC', publicInfoVisibility: 'PUBLIC', pinnedTrack: '', pinnedTrackVisibility: 'PUBLIC', allowPreview: true });
  const [accountData, setAccountData] = useState({ email: '', displayName: '', googleSub: '' });
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    if (!profile) return;
    setFormData({
      username: profile.username || '',
      bio: profile.bio || '',
      publicInfo: profile.publicInfo || '',
      bioVisibility: profile.bioVisibility || 'PUBLIC',
      publicInfoVisibility: profile.publicInfoVisibility || 'PUBLIC',
      pinnedTrack: profile.pinnedTrackId || '',
      pinnedTrackVisibility: profile.pinnedTrackVisibility || 'PUBLIC',
      allowPreview: Boolean(profile.allowPreviewPlayer),
    });
    setAccountData({
      email: profile.email || currentUser?.email || '',
      displayName: profile.displayName || '',
      googleSub: '',
    });
  }, [profile, currentUser?.email]);

  useEffect(() => {
    let mounted = true;
    const videoId = extractYouTubeId(profile?.pinnedTrackId || '');
    setIsPlaying(false);
    if (!videoId) {
      setPinnedVideoDetails(null);
      return undefined;
    }
    getYouTubeVideoDetails(videoId).then((details) => {
      if (mounted) setPinnedVideoDetails(details || null);
    });
    return () => { mounted = false; };
  }, [profile?.pinnedTrackId]);

  const profileData = useMemo(() => {
    if (!profile) return null;
    const firstMusic = (profile.shelves || []).flatMap(s => s.items || []).find(item => item.type === 'music');
    return {
      name: profile.displayName || 'Soundbook user',
      username: profile.username ? `@${profile.username}` : `@user${profile.userId}`,
      bio: profile.bio || '',
      publicInfo: profile.publicInfo || '',
      description: profile.bio || profile.publicInfo || 'Chưa cập nhật giới thiệu cá nhân.',
      avatar: fallbackAvatar(profile.userId),
      avatarUrl: profile.avatarUrl ? `${profile.avatarUrl}${profile.avatarUrl.includes('?') ? '&' : '?'}t=${new Date(profile.updatedAt || Date.now()).getTime()}` : null,
      coverUrl: profile.coverUrl ? `${profile.coverUrl}${profile.coverUrl.includes('?') ? '&' : '?'}t=${new Date(profile.updatedAt || Date.now()).getTime()}` : null,
      themeColor: 'from-orange-500/20 to-purple-900/40',
      matchScore: isGuest ? profile.matchScore : null,
      matchReasons: profile.sharedFeatures || [],
      friendshipStatus: profile.friendshipStatus || 'NONE',
      friendRequestId: profile.friendRequestId,
      canMessage: profile.canMessage,
      following: Boolean(profile.following),
      allowPreviewPlayer: Boolean(profile.allowPreviewPlayer),
      stats: profile.stats,
      pinnedSong: {
        videoId: extractYouTubeId(profile.pinnedTrackId || ''),
        title: pinnedVideoDetails?.title || firstMusic?.title || 'Chưa chọn nhạc ghim',
        artist: pinnedVideoDetails?.channelTitle || firstMusic?.author || 'Music & Book community',
        thumbnail: pinnedVideoDetails?.thumbnail || firstMusic?.image,
        cover: 'bg-gradient-to-br from-indigo-500 to-purple-600',
      },
    };
  }, [profile, isGuest, pinnedVideoDetails]);

  // Pinned-track: derive playing state from global context
  const pinnedTrackId = profileData?.pinnedSong?.videoId
    ? `pinned-${profile?.userId}`
    : null;
  const isPinnedPlaying = Boolean(pinnedTrackId && currentTrack?.id === pinnedTrackId && globalIsPlaying);

  const shelves = useMemo(() => (profile?.shelves || []).map(shelf => ({
    ...shelf,
    items: (shelf.items || []).map(normalizeShelfItem),
  })), [profile]);

  const friends = useMemo(() => (profile?.friendsPreview || []).map(friend => ({
    id: friend.userId,
    name: friend.displayName || 'Soundbook user',
    avatar: fallbackAvatar(friend.userId),
    avatarUrl: friend.avatarUrl,
    isOnline: false,
    match: Math.round(friend.matchScore || 0),
  })), [profile]);

  const posts = useMemo(() => (profile?.posts || []).map(normalizePost), [profile]);

  // Auto scroll and highlight post when navigated with ?post=postId
  useEffect(() => {
    if (!targetPostId || isLoading || !posts.length) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`post-${targetPostId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', 'ring-primary-500', 'ring-offset-2', 'dark:ring-offset-gray-900', 'shadow-2xl');
        setTimeout(() => {
          el.classList.remove('ring-4', 'ring-primary-500', 'ring-offset-2', 'dark:ring-offset-gray-900', 'shadow-2xl');
        }, 3500);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [targetPostId, isLoading, posts]);

  const lastUpdate = profile?.updatedAt ? new Date(profile.updatedAt).toLocaleString('vi-VN') : 'Chưa cập nhật';

  const replaceProfile = (data, successMessage) => {
    setProfile(data);
    if (!isGuest && data) {
      updateStoredUser({
        displayName: data.displayName,
        username: data.username,
        avatarUrl: data.avatarUrl,
        avatar: data.avatarUrl
      });
    }
    if (successMessage) showNotice('success', successMessage);
  };

  const patchProfilePosts = (updater) => {
    setProfile(prev => prev ? { ...prev, posts: updater(prev.posts || []) } : prev);
  };

  const handleAddFriend = async () => {
    if (!profile?.userId) return;
    try {
      setSocialBusy(true);
      const result = await friendsApi.sendRequest(profile.userId);
      setProfile(prev => ({ ...prev, friendshipStatus: result.friendshipStatus, friendRequestId: result.requestId, canMessage: result.canMessage }));
      showNotice('success', 'Đã gửi lời mời kết bạn.');
    } catch (err) {
      showNotice('error', err?.message || 'Không thể gửi lời mời kết bạn.');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleAcceptFriend = async () => {
    if (!profile?.friendRequestId) return;
    try {
      setSocialBusy(true);
      const result = await friendsApi.acceptRequest(profile.friendRequestId);
      setProfile(prev => ({ ...prev, friendshipStatus: result.friendshipStatus, friendRequestId: result.requestId, canMessage: result.canMessage }));
      await loadProfile();
      showNotice('success', 'Đã chấp nhận lời mời kết bạn.');
    } catch (err) {
      showNotice('error', err?.message || 'Không thể chấp nhận lời mời.');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleFollow = async () => {
    if (!profile?.userId) return;
    try {
      setSocialBusy(true);
      const data = await profileApi.followProfile(profile.userId);
      replaceProfile(data, 'Đã theo dõi người dùng này.');
    } catch (err) {
      showNotice('error', err?.message || 'Không thể theo dõi profile.');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleUnfollow = async () => {
    if (!profile?.userId) return;
    try {
      setSocialBusy(true);
      const data = await profileApi.unfollowProfile(profile.userId);
      replaceProfile(data, 'Đã bỏ theo dõi người dùng này.');
    } catch (err) {
      showNotice('error', err?.message || 'Không thể bỏ theo dõi profile.');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleMessage = async () => {
    if (!profile?.userId) return;
    try {
      setSocialBusy(true);
      const result = await friendsApi.startChat(profile.userId);
      if (result?.dmThreadId) navigate(`/chat?threadId=${result.dmThreadId}`);
    } catch (err) {
      showNotice('error', err?.message || 'Không thể mở cuộc trò chuyện.');
    } finally {
      setSocialBusy(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTogglePreview = () => setFormData(prev => ({ ...prev, allowPreview: !prev.allowPreview }));

  const handleSaveInfo = async () => {
    try {
      setBusy(true);
      const data = await profileApi.updateProfile({
        username: formData.username,
        bio: formData.bio,
        publicInfo: formData.publicInfo,
        bioVisibility: formData.bioVisibility,
        publicInfoVisibility: formData.publicInfoVisibility,
        pinnedTrackId: extractYouTubeId(formData.pinnedTrack),
        pinnedTrackVisibility: formData.pinnedTrackVisibility,
        allowPreviewPlayer: formData.allowPreview,
      });
      replaceProfile(data, 'Đã lưu thông tin cá nhân.');
      setIsEditingInfo(false);
    } catch (err) {
      showNotice('error', err?.message || 'Không thể lưu thông tin cá nhân.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccountInputChange = (e) => {
    const { name, value } = e.target;
    setAccountData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveAccountInfo = async () => {
    try {
      setBusy(true);
      const data = await profileApi.updateProfile({ displayName: accountData.displayName });
      replaceProfile(data, 'Đã lưu tên hiển thị.');
      setIsEditingAccount(false);
    } catch (err) {
      showNotice('error', err?.message || 'Không thể lưu tài khoản.');
    } finally {
      setBusy(false);
    }
  };

  const handleShareProfile = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showNotice('success', 'Đã copy link profile.');
    } catch {
      setCopyModal({ open: true, url });
    }
  };

  const openMediaModal = (kind) => {
    setMediaModal({ open: true, kind });
    fileInputRef.current?.click();
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => setImageSrc(reader.result));
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset for same file selection
    }
  };

  const uploadCroppedImage = async () => {
    if (!croppedAreaPixels || !imageSrc) return;
    try {
      setBusy(true);
      const image = new Image();
      image.src = imageSrc;
      await new Promise((resolve) => (image.onload = resolve));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
      );

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const file = new File([blob], `${mediaModal.kind}.jpg`, { type: 'image/jpeg' });
      
      const formData = new FormData();
      formData.append('file', file);
      
      const apiResult = await (mediaModal.kind === 'avatar' 
        ? profileApi.updateAvatar(formData) 
        : profileApi.updateCover(formData));

      const updatedProfile = await loadProfile();
      
      if (mediaModal.kind === 'avatar') {
        const newAvatarUrl = apiResult?.avatarUrl || apiResult?.avatar || updatedProfile.avatarUrl || updatedProfile.avatar;
        updateStoredUser({ avatarUrl: newAvatarUrl, avatar: newAvatarUrl });
      }
      showNotice('success', mediaModal.kind === 'avatar' ? 'Đã cập nhật ảnh đại diện.' : 'Đã cập nhật ảnh bìa.');
      setImageSrc(null);
      setMediaModal({ open: false, kind: 'avatar' });
    } catch (err) {
      showNotice('error', err?.message || 'Không thể cập nhật ảnh.');
    } finally {
      setBusy(false);
    }
  };

  const openShelfModal = (mode, shelfId, item = null) => {
    const isMusic = shelfId === 'playlists';
    setShelfModal({
      open: true,
      mode,
      shelfId,
      item,
      form: isMusic
        ? {
          ...emptyMusicForm,
          title: item?.title || '',
          subtitle: item?.author || '',
          coverUrl: item?.image || '',
          itemId: item?.itemId || item?.original?.itemId || '',
          visibility: item?.visibility || 'PUBLIC',
        }
        : {
          ...emptyBookForm,
          title: item?.title || '',
          author: item?.author || '',
          coverUrl: item?.image || '',
          rating: item?.rating || 5,
          progressPercent: item?.progress || 0,
          visibility: item?.visibility || 'PUBLIC',
        },
    });
    setShelfSearch({ query: '', loading: false, results: [], error: '' });
  };

  const saveShelfModal = async () => {
    const { mode, shelfId, item, form } = shelfModal;
    const isMusic = shelfId === 'playlists';
    if (!form.title?.trim()) {
      showNotice('error', 'Vui lòng nhập tiêu đề.');
      return;
    }

    try {
      setBusy(true);
      const data = isMusic
        ? (mode === 'add'
          ? await profileApi.addMusic({
            itemType: form.itemType || 'PLAYLIST',
            itemId: extractYouTubeId(form.itemId || ''),
            title: form.title.trim(),
            subtitle: form.subtitle?.trim() || '',
            coverUrl: form.coverUrl?.trim() || '',
            visibility: form.visibility || 'PUBLIC',
          })
          : await profileApi.updateMusic(item.id, {
            itemType: form.itemType || 'PLAYLIST',
            itemId: extractYouTubeId(form.itemId || ''),
            title: form.title.trim(),
            subtitle: form.subtitle?.trim() || '',
            coverUrl: form.coverUrl?.trim() || '',
            visibility: form.visibility || 'PUBLIC',
          }))
        : (mode === 'add'
          ? await profileApi.addBook({
            shelfCode: form.shelfCode || 'WILL_READ',
            title: form.title.trim(),
            author: form.author?.trim() || '',
            coverUrl: form.coverUrl?.trim() || '',
            rating: Number(form.rating) || 5,
            progressPercent: Number(form.progressPercent) || 0,
            visibility: form.visibility || 'PUBLIC',
          })
          : await profileApi.updateBook(item.id, {
            shelfCode: form.shelfCode || 'WILL_READ',
            title: form.title.trim(),
            author: form.author?.trim() || '',
            coverUrl: form.coverUrl?.trim() || '',
            rating: Number(form.rating) || 5,
            progressPercent: Number(form.progressPercent) || 0,
            visibility: form.visibility || 'PUBLIC',
          }));

      replaceProfile(data, mode === 'add' ? 'Đã thêm mục vào kệ.' : 'Đã lưu chỉnh sửa kệ.');
      setShelfModal({ open: false, mode: 'add', shelfId: 'playlists', item: null, form: emptyMusicForm });
      setShelfSearch({ query: '', loading: false, results: [], error: '' });
    } catch (err) {
      showNotice('error', err?.message || 'Không thể lưu kệ.');
    } finally {
      setBusy(false);
    }
  };

  const handleShelfSearch = async () => {
    const isMusic = shelfModal.shelfId === 'playlists';
    const query = shelfSearch.query.trim();
    if (!query) return;

    try {
      setShelfSearch(prev => ({ ...prev, loading: true, error: '' }));
      if (isMusic) {
        const results = await searchYouTubeVideos(query, 8);
        setShelfSearch(prev => ({ ...prev, loading: false, results, error: results.length ? '' : 'Không tìm thấy kết quả.' }));
      } else {
        const raw = await searchGoogleBooks(query, 8);
        const results = raw.map(normalizeBook);
        setShelfSearch(prev => ({ ...prev, loading: false, results, error: results.length ? '' : 'Không tìm thấy kết quả.' }));
      }
    } catch (err) {
      const errorMsg = err.message === 'QUOTA_EXCEEDED' 
        ? 'Tìm kiếm quá nhanh. Vui lòng thử lại sau vài giây.' 
        : 'Lỗi tìm kiếm.';
      setShelfSearch(prev => ({ ...prev, loading: false, error: errorMsg }));
    }
  };

  const selectShelfResult = (item) => {
    const isMusic = shelfModal.shelfId === 'playlists';
    if (isMusic) {
      setShelfModal(prev => ({
        ...prev,
        form: {
          ...prev.form,
          title: item.title,
          subtitle: item.channelTitle,
          coverUrl: item.thumbnail,
          itemId: item.videoId,
        }
      }));
    } else {
      setShelfModal(prev => ({
        ...prev,
        form: {
          ...prev.form,
          title: item.title,
          author: Array.isArray(item.authors) ? item.authors.join(', ') : item.authors,
          coverUrl: item.thumbnail,
          rating: Math.round(item.rating || 5),
        }
      }));
    }
    setShelfSearch(prev => ({ ...prev, results: [] }));
  };

  useEffect(() => {
    const query = shelfSearch.query.trim();
    if (query.length < 2) {
      setShelfSearch(prev => ({ ...prev, results: [], error: '' }));
      return;
    }

    const timer = setTimeout(() => {
      handleShelfSearch();
    }, 600);

    return () => clearTimeout(timer);
  }, [shelfSearch.query]);

  const deleteShelfItem = async () => {
    if (!deleteShelf?.item) return;
    try {
      setBusy(true);
      const data = deleteShelf.shelfId === 'playlists'
        ? await profileApi.deleteMusic(deleteShelf.item.id)
        : await profileApi.deleteBook(deleteShelf.item.id);
      replaceProfile(data, 'Đã xóa mục khỏi kệ.');
      setDeleteShelf(null);
    } catch (err) {
      showNotice('error', err?.message || 'Không thể xóa mục này.');
    } finally {
      setBusy(false);
    }
  };

  const searchPinnedTrack = async () => {
    const query = pinnedModal.query.trim();
    if (!query) {
      setPinnedModal(prev => ({ ...prev, error: 'Nhập tên bài hát hoặc nghệ sĩ để tìm trên YouTube.' }));
      return;
    }
    try {
      setPinnedModal(prev => ({ ...prev, loading: true, error: '' }));
      const results = await searchYouTubeVideos(query, 8);
      setPinnedModal(prev => ({ ...prev, loading: false, results, error: results.length ? '' : 'Không tìm thấy kết quả phù hợp.' }));
    } catch (err) {
      setPinnedModal(prev => ({ ...prev, loading: false, error: err?.message || 'Không thể tìm YouTube.' }));
    }
  };

  const selectPinnedTrack = async (video) => {
    if (!video?.videoId) return;
    const selectedVideoId = extractYouTubeId(video.videoId);
    setFormData(prev => ({ ...prev, pinnedTrack: selectedVideoId }));
    setPinnedVideoDetails(video);
    setPinnedModal(prev => ({ ...prev, loading: true, error: '' }));

    try {
      setBusy(true);
      const data = await profileApi.updateProfile({
        username: formData.username,
        bio: formData.bio,
        publicInfo: formData.publicInfo,
        bioVisibility: formData.bioVisibility,
        publicInfoVisibility: formData.publicInfoVisibility,
        pinnedTrackId: selectedVideoId,
        pinnedTrackVisibility: formData.pinnedTrackVisibility,
        allowPreviewPlayer: formData.allowPreview,
      });
      replaceProfile(data, 'Đã đổi nhạc ghim trên profile.');
      setPinnedModal({ open: false, query: '', loading: false, results: [], error: '' });
      setIsEditingInfo(false);
    } catch (err) {
      setPinnedModal(prev => ({ ...prev, loading: false, error: err?.message || 'Không thể lưu nhạc ghim.' }));
      showNotice('error', err?.message || 'Không thể lưu nhạc ghim.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordInputChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({ ...prev, [name]: value }));
  };

  const handleSavePassword = () => {
    setIsChangingPassword(false);
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    showNotice('info', 'Chức năng đổi mật khẩu chưa khả dụng.');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh] gap-3 text-text-muted">
        <Loader2 className="w-9 h-9 animate-spin text-primary-500" />
        <span className="text-sm font-medium">Đang tải trang cá nhân...</span>
      </div>
    );
  }

  if (error || !profile || !profileData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4">
        <div className="p-4 rounded-full bg-red-50 dark:bg-red-950/30 text-red-500">
          <AlertCircle size={32} />
        </div>
        <p className="text-base font-semibold text-text-color">{error || 'Không tìm thấy thông tin trang cá nhân.'}</p>
        <Link to="/" className="px-4 py-2 rounded-xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors">
          Về trang chủ
        </Link>
      </div>
    );
  }

  const currentShelfIsMusic = shelfModal.shelfId === 'playlists';

  return (
    <div className="flex flex-col gap-6 -mt-6">
      <ToastMessage notice={notice} onClose={() => setNotice(null)} />

      <ProfileHeader
        profileData={profileData}
        isGuest={isGuest}
        isPlaying={Boolean(isPinnedPlaying)}
        onTogglePlay={() => {
          if (!profileData?.pinnedSong?.videoId) return;
          const track = {
            id: pinnedTrackId,
            _videoId: profileData.pinnedSong.videoId,
            media: {
              coverUrl: profileData.pinnedSong.thumbnail || '',
              title: profileData.pinnedSong.title,
              artist: profileData.pinnedSong.artist,
            },
            user: { name: profileData.name },
          };
          playTrack(track);
        }}
        onPlayerReady={() => {}} // no-op: global context owns the player
        t={t}
        onAddFriend={handleAddFriend}
        onAcceptFriend={handleAcceptFriend}
        onMessage={handleMessage}
        onShareProfile={handleShareProfile}
        onChangeAvatar={() => openMediaModal('avatar')}
        onChangeCover={() => openMediaModal('cover')}
        onChangePinnedTrack={() => setPinnedModal({ open: true, query: '', loading: false, results: [], error: '' })}
        onFollow={handleFollow}
        onUnfollow={handleUnfollow}
        onReport={() => setIsReportModalOpen(true)}
        socialBusy={socialBusy}
      />


      <div className="max-w-screen-xl mx-auto w-full px-4 sm:px-6 lg:px-8 space-y-10 pb-20 pt-4">
        <div className="flex justify-between items-end mb-6">
          <h2 className="text-2xl font-bold tracking-tight">{t('profile.title')}</h2>
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button onClick={() => setViewMode('shelf')} className={`p-1.5 rounded-md ${viewMode === 'shelf' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-500' : 'text-text-muted transition-colors'}`}><Grid3X3 size={18} /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-500' : 'text-text-muted transition-colors'}`}><List size={18} /></button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 relative items-start">
          <div className="w-full lg:w-[30%] space-y-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto scrollbar-hide pb-4 lg:pr-2">
            <PersonalInfo t={t} isGuest={isGuest} profileData={profileData} isEditingInfo={isEditingInfo} setIsEditingInfo={setIsEditingInfo} formData={formData} handleInputChange={handleInputChange} handleTogglePreview={handleTogglePreview} handleSaveInfo={handleSaveInfo} lastUpdate={lastUpdate} onOpenPinnedTrackSearch={() => setPinnedModal({ open: true, query: '', loading: false, results: [], error: '' })} />
            <AccountInfo t={t} isGuest={isGuest} isEditingAccount={isEditingAccount} setIsEditingAccount={setIsEditingAccount} accountData={accountData} handleAccountInputChange={handleAccountInputChange} handleSaveAccountInfo={handleSaveAccountInfo} isChangingPassword={isChangingPassword} setIsChangingPassword={setIsChangingPassword} passwordData={passwordData} handlePasswordInputChange={handlePasswordInputChange} handleSavePassword={handleSavePassword} lastUpdate={lastUpdate} />
            <FriendsList t={t} friends={friends} />
            <FollowersList t={t} followers={followers} onViewAll={() => setIsFollowersModalOpen(true)} />
            {!isGuest && (
              <TasteSummaryCard />
            )}
          </div>

          <div className="flex-1 w-full lg:w-[70%] space-y-16 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto scrollbar-hide pb-4 lg:pr-2">
            <ProfileShelves
              t={t}
              shelves={shelves}
              isGuest={isGuest}
              onAddItem={(shelfId) => openShelfModal('add', shelfId)}
              onEditItem={(shelfId, item) => openShelfModal('edit', shelfId, item)}
              onDeleteItem={(shelfId, item) => setDeleteShelf({ shelfId, item })}
            />
            <ProfilePosts
              t={t}
              userId={profile?.userId}
              initialPosts={posts}
              isGuest={isGuest}
            />
          </div>
        </div>
      </div>

      <ModalShell
        open={isFollowersModalOpen}
        title="Người theo dõi"
        description={`Danh sách những người đang theo dõi ${isGuest ? profileData.name : 'bạn'}.`}
        onClose={() => setIsFollowersModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={followerSearch.query}
              onChange={(e) => setFollowerSearch(prev => ({ ...prev, query: e.target.value }))}
              placeholder="Tìm kiếm người theo dõi..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none text-sm transition-all"
            />
            {followerSearch.loading && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
            {followerSearch.results.map(follower => (
              <div key={follower.userId} className="flex items-center justify-between gap-4 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Link to={`/profile/${follower.userId}`} onClick={() => setIsFollowersModalOpen(false)} className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  {follower.avatarUrl ? (
                    <img src={follower.avatarUrl} alt={follower.displayName} className="w-12 h-12 rounded-full object-cover border border-gray-100 dark:border-gray-800" />
                  ) : (
                    <div className={`w-12 h-12 rounded-full ${fallbackAvatar(follower.userId)} flex items-center justify-center text-white text-sm font-bold`}>
                      {follower.displayName?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{follower.displayName}</p>
                  <p className="text-xs text-text-muted truncate">@{follower.username || `user${follower.userId}`}</p>
                </div>
              </Link>
              <Link to={`/profile/${follower.userId}`} onClick={() => setIsFollowersModalOpen(false)} className="px-4 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold rounded-xl transition-all active:scale-95">
                Xem hồ sơ
              </Link>
            </div>
          ))}
          {followerSearch.results.length === 0 && !followerSearch.loading && (
            <div className="py-10 text-center text-text-muted italic">
              {followerSearch.query ? 'Không tìm thấy người theo dõi nào phù hợp.' : 'Chưa có người theo dõi nào.'}
            </div>
          )}
        </div>
      </div>
    </ModalShell>

      <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />

      {/* Image Cropper Modal */}
      {imageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-surface-color w-full max-w-xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 z-10 relative">
              <h3 className="font-bold">
                {mediaModal.kind === 'avatar' ? 'Cắt ảnh đại diện' : 'Cắt ảnh bìa'}
              </h3>
              <button onClick={() => setImageSrc(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="relative w-full h-[400px] bg-black/50">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={mediaModal.kind === 'avatar' ? 1 : 16 / 9}
                cropShape={mediaModal.kind === 'avatar' ? 'round' : 'rect'}
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="p-5 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-4 z-10 relative">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Thu phóng</label>
                  <span className="text-[10px] font-mono text-primary-500">{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-primary-500"
                />
              </div>

              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setImageSrc(null)}
                  disabled={busy}
                  className="px-5 py-2 font-semibold text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-text-color rounded-xl transition-colors disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={uploadCroppedImage}
                  disabled={busy}
                  className="px-8 py-2 font-bold text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-xl shadow-lg shadow-primary-500/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {busy ? 'Đang xử lý...' : 'Lưu & Cập nhật'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ModalShell
        open={copyModal.open}
        title="Copy link profile"
        description="Trình duyệt không cho copy tự động. Bạn có thể copy link dưới đây."
        onClose={() => setCopyModal({ open: false, url: '' })}
      >
        <input readOnly value={copyModal.url} onFocus={(event) => event.target.select()} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
      </ModalShell>

      <ModalShell
        open={shelfModal.open}
        title={`${shelfModal.mode === 'add' ? 'Thêm' : 'Sửa'} ${currentShelfIsMusic ? 'playlist/bài nhạc' : 'sách/truyện'}`}
        description="Bạn có thể tìm kiếm để điền nhanh thông tin hoặc nhập thủ công bên dưới."
        onClose={() => setShelfModal({ open: false, mode: 'add', shelfId: 'playlists', item: null, form: emptyMusicForm })}
        footer={(
          <>
            <button type="button" onClick={() => setShelfModal({ open: false, mode: 'add', shelfId: 'playlists', item: null, form: emptyMusicForm })} disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-text-muted hover:bg-gray-100 disabled:opacity-60 dark:hover:bg-gray-800">Hủy</button>
            <button type="button" onClick={saveShelfModal} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
              <Save size={15} /> {busy ? 'Đang lưu...' : 'Lưu'}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          {/* Search Section */}
          <div className="bg-primary-500/5 p-4 rounded-2xl border border-primary-500/10 space-y-3">
            <div className="flex gap-2">
              <input
                value={shelfSearch.query}
                onChange={(e) => setShelfSearch(prev => ({ ...prev, query: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleShelfSearch(); }}
                placeholder={currentShelfIsMusic ? 'Tìm tên bài hát, playlist trên YouTube...' : 'Tìm tên sách, tác giả trên Google Books...'}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                type="button"
                onClick={handleShelfSearch}
                disabled={shelfSearch.loading}
                className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors"
              >
                {shelfSearch.loading ? '...' : 'Tìm'}
              </button>
            </div>

            {shelfSearch.results.length > 0 && (
              <div className="max-h-60 overflow-y-auto space-y-2 mt-2 pr-1 custom-scrollbar">
                {shelfSearch.results.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectShelfResult(item)}
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-2 text-left hover:border-primary-500 hover:bg-white dark:border-gray-700 dark:hover:bg-gray-800 transition-all"
                  >
                    <img src={item.thumbnail} alt="" className="h-10 w-14 rounded object-cover flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{item.title}</p>
                      <p className="truncate text-[10px] text-text-muted">
                        {currentShelfIsMusic ? item.channelTitle : (Array.isArray(item.authors) ? item.authors.join(', ') : item.authors)}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-primary-500 bg-primary-500/10 px-2 py-0.5 rounded-full">Chọn</span>
                  </button>
                ))}
              </div>
            )}
            {shelfSearch.error && <p className="text-xs text-red-500 px-1">{shelfSearch.error}</p>}
          </div>

          {/* Form Fields */}
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase px-1">Thông tin chi tiết</label>
              <input
                value={shelfModal.form.title || ''}
                onChange={(event) => setShelfModal(prev => ({ ...prev, form: { ...prev.form, title: event.target.value } }))}
                placeholder={currentShelfIsMusic ? 'Tên playlist/bài hát' : 'Tên sách/truyện'}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            
            <input
              value={currentShelfIsMusic ? (shelfModal.form.subtitle || '') : (shelfModal.form.author || '')}
              onChange={(event) => setShelfModal(prev => ({ ...prev, form: { ...prev.form, [currentShelfIsMusic ? 'subtitle' : 'author']: event.target.value } }))}
              placeholder={currentShelfIsMusic ? 'Nghệ sĩ/mô tả' : 'Tác giả'}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
            />
            
            <input
              value={shelfModal.form.coverUrl || ''}
              onChange={(event) => setShelfModal(prev => ({ ...prev, form: { ...prev.form, coverUrl: event.target.value } }))}
              placeholder="URL ảnh bìa/cover (Tự động điền khi tìm kiếm)"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
            />
            
            {currentShelfIsMusic ? (
              <div className="grid grid-cols-1 gap-2 rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/60">
                <label className="text-[11px] font-semibold text-text-muted">YouTube videoId (Tự động điền khi tìm kiếm)</label>
                <input
                  value={shelfModal.form.itemId || ''}
                  onChange={(event) => setShelfModal(prev => ({ ...prev, form: { ...prev.form, itemId: event.target.value } }))}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </div>
            ) : null}
            
            <div className="grid grid-cols-1 gap-1">
              <label className="text-[11px] font-bold text-text-muted uppercase px-1">Quyền riêng tư</label>
              <select
                value={shelfModal.form.visibility || 'PUBLIC'}
                onChange={(event) => setShelfModal(prev => ({ ...prev, form: { ...prev.form, visibility: event.target.value } }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="PUBLIC">Công khai</option>
                <option value="FOLLOWERS">Người theo dõi</option>
                <option value="FRIENDS">Bạn bè</option>
                <option value="PRIVATE">Chỉ mình tôi</option>
              </select>
            </div>

            {!currentShelfIsMusic ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-muted uppercase px-1">Đánh giá</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={shelfModal.form.rating || 5}
                    onChange={(event) => setShelfModal(prev => ({ ...prev, form: { ...prev.form, rating: event.target.value } }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-text-muted uppercase px-1">Tiến độ (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={shelfModal.form.progressPercent || 0}
                    onChange={(event) => setShelfModal(prev => ({ ...prev, form: { ...prev.form, progressPercent: event.target.value } }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
                  />
                </div>
              </div>
            ) : null}
            
            {shelfModal.form.coverUrl && (
              <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 mt-2">
                <img src={shelfModal.form.coverUrl} alt="Cover preview" className="h-40 w-full object-cover" />
              </div>
            )}
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={pinnedModal.open}
        title="Chọn nhạc ghim từ YouTube"
        description="Tìm bài hát rồi chọn để lưu trực tiếp làm nhạc ghim trên profile."
        onClose={() => setPinnedModal({ open: false, query: '', loading: false, results: [], error: '' })}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={pinnedModal.query}
              onChange={(event) => setPinnedModal(prev => ({ ...prev, query: event.target.value }))}
              onKeyDown={(event) => { if (event.key === 'Enter') searchPinnedTrack(); }}
              placeholder="Nhập tên bài hát, nghệ sĩ..."
              className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-900"
            />
            <button type="button" onClick={searchPinnedTrack} disabled={pinnedModal.loading} className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60">
              {pinnedModal.loading ? 'Đang xử lý...' : 'Tìm'}
            </button>
          </div>
          {pinnedModal.error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{pinnedModal.error}</div> : null}
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {pinnedModal.results.map(video => (
              <button
                key={video.videoId}
                type="button"
                onClick={() => selectPinnedTrack(video)}
                className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 p-3 text-left hover:border-primary-500 hover:bg-primary-50 dark:border-gray-700 dark:hover:bg-primary-900/20"
              >
                <img src={video.thumbnail} alt={video.title} className="h-14 w-20 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{video.title}</p>
                  <p className="truncate text-xs text-text-muted">{video.channelTitle}</p>
                </div>
                <span className="rounded-full bg-primary-500 px-3 py-1 text-xs font-semibold text-white">Chọn & lưu</span>
              </button>
            ))}
          </div>
        </div>
      </ModalShell>

      <ConfirmDialog
        open={Boolean(deleteShelf)}
        danger
        title="Xóa khỏi kệ"
        message={`Bạn chắc chắn muốn xóa "${deleteShelf?.item?.title || 'mục này'}" khỏi profile?`}
        confirmLabel="Xóa"
        busy={busy}
        onClose={() => setDeleteShelf(null)}
        onConfirm={deleteShelfItem}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        type="USER"
        targetId={targetId || profileData?.userId || profileData?.id}
      />
    </div>
  );
};

export default Profile;
