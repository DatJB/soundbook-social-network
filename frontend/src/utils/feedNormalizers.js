const AVATAR_CLASSES = [
  'bg-blue-500', 'bg-pink-500', 'bg-green-500', 'bg-purple-500',
  'bg-yellow-500', 'bg-teal-500', 'bg-rose-500', 'bg-indigo-500', 'bg-orange-500',
];

export const fallbackAvatar = (id) => AVATAR_CLASSES[Number(id || 0) % AVATAR_CLASSES.length];

export const formatTime = (value) => {
  if (!value) return '';
  const created = new Date(value);
  if (Number.isNaN(created.getTime())) return '';
  const diffMs = Date.now() - created.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return created.toLocaleDateString('vi-VN');
};

const safeLower = (value) => (value ? String(value).toLowerCase() : null);

export const normalizeComment = (comment = {}) => {
  const pid = comment.parentId || comment.parent_id || comment.original?.parentId || comment.original?.parent_id;
  
  return {
    id: comment.id,
    parentId: pid,
  user: {
    id: comment.user?.userId || comment.authorId,
    name: comment.user?.displayName || comment.authorName || 'Soundbook user',
    username: comment.user?.username,
    avatarUrl: comment.user?.avatarUrl || comment.authorAvatar,
    avatar: fallbackAvatar(comment.user?.userId || comment.authorId),
    following: Boolean(comment.user?.following),
    self: Boolean(comment.user?.self),
  },
  text: comment.text || comment.content || '',
  time: formatTime(comment.createdAt),
  reacts: comment.reactsCount || comment.reacts || 0,
  replyCount: comment.replyCount || 0,
  currentUserReaction: comment.currentUserReaction ? comment.currentUserReaction.toLowerCase() : null,
    original: comment,
  };
};

export const normalizePost = (post = {}) => {
  const ref = (() => {
    if (!post.refJson) return null;
    if (typeof post.refJson === 'object') return post.refJson;
    try {
      return JSON.parse(post.refJson);
    } catch (e) {
      console.error('Failed to parse refJson', e);
      return null;
    }
  })();

  const type = post.type?.toLowerCase() || 'blog';
  const isAudio = type === 'audio' || type === 'music_quick_note';

  return {
    id: post.id,
    type: type,
    content: post.caption || post.contentRich || '',
    reason: post.reason,
    tasteScore: post.tasteScore || 0,
    authorMatch: post.authorMatch || 0,
    finalScore: post.finalScore || 0,
    commentsEnabled: post.commentsEnabled !== false,
    currentUserReaction: safeLower(post.currentUserReaction),
    canEdit: Boolean(post.canEdit),
    visibility: post.visibility,
    status: post.status,
    createdAt: post.createdAt,
    original: post,
    user: {
      id: post.user?.userId || post.authorId,
      name: post.user?.displayName || post.authorName || 'Soundbook user',
      username: post.user?.username || post.authorEmail?.split('@')[0],
      avatarUrl: post.user?.avatarUrl,
      avatar: fallbackAvatar(post.user?.userId || post.authorId),
      time: formatTime(post.createdAt),
      following: Boolean(post.user?.following),
      self: Boolean(post.user?.self),
    },
    media: (() => {
      if (type === 'blog' && !post.media?.coverUrl && !post.media?.url) return null;
      const thumb = ref?.thumbnail || post.media?.coverUrl || post.media?.url || '';
      const title = ref?.title || post.media?.title;
      
      // Only consider it having media if there's a reference title OR an actual image/video URL
      const hasMedia = (ref && ref.title) || thumb || post.media?.title;
      if (!hasMedia) return null;
      // Extract YouTube videoId from thumbnail URL if id is missing
      const thumbMatch = thumb.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
      const videoId = ref?.id || ref?.videoId || ref?.itemId || (thumbMatch ? thumbMatch[1] : null);
      return {
        id: videoId,
        title: ref?.title || post.media?.title || (isAudio ? 'Bài chia sẻ âm nhạc' : 'Bài chia sẻ sách/truyện'),
        artist: ref?.artist || ref?.channelTitle || (ref?.subtitle || '').trim() || post.media?.subtitle || 'Soundbook',
        author: ref?.author || (ref?.subtitle || '').trim() || post.media?.subtitle || 'Soundbook',
        coverUrl: thumb || null,
        cover: isAudio
          ? 'bg-gradient-to-br from-purple-500 to-indigo-600'
          : 'bg-gradient-to-br from-orange-400 to-red-600',
        rating: post.media?.rating,
        ref: { ...(ref || {}), id: videoId },
      };
    })(),
    sharedPost: ref?.sharedPostId ? {
      id: ref.sharedPostId,
      authorId: ref.sharedAuthorId,
      authorName: ref.sharedAuthor,
      authorUsername: ref.sharedAuthorUsername,
      authorAvatar: ref.sharedAuthorAvatar,
      caption: ref.sharedCaption,
      createdAt: ref.sharedCreatedAt,
      time: formatTime(ref.sharedCreatedAt),
      type: ref.sharedType?.toLowerCase(),
      thumbnail: ref.thumbnail,
      mediaType: ref.mediaType,
      title: ref.title,
      artist: ref.artist || ref.channelTitle || (ref.subtitle || '').trim(),
      videoId: ref.videoId || ref.id,
      metadataType: ref.type || ref.metadataType,
    } : null,
    reactions: {
      like: post.reactions?.like || 0,
      heart: post.reactions?.heart || 0,
      fire: post.reactions?.fire || 0,
      flame: post.reactions?.fire || 0,
      haha: post.reactions?.haha || post.reactions?.laugh || 0,
      laugh: post.reactions?.laugh || post.reactions?.haha || 0,
      wow: post.reactions?.wow || 0,
      sad: post.reactions?.sad || 0,
      angry: post.reactions?.angry || 0,
      comments: post.reactions?.comments || 0,
      shares: post.reactions?.shares || 0,
    },
    comments: (post.comments || []).map(normalizeComment),
  };
};

export const normalizeSuggestion = (user = {}) => ({
  id: user.userId,
  name: user.displayName || 'Soundbook user',
  username: user.username,
  match: Math.round(user.finalMatch || 0),
  avatarUrl: user.avatarUrl,
  avatar: fallbackAvatar(user.userId),
  sharedFeatures: user.sharedFeatures || [],
  friendshipStatus: user.friendshipStatus || 'NONE',
  requestId: user.requestId || null,
  canMessage: Boolean(user.canMessage),
});

export const normalizeTrending = (item = {}) => ({
  id: item.postId,
  title: item.title || 'Bài viết Soundbook',
  subtitle: item.subtitle || 'Soundbook',
  type: item.type === 'audio' ? 'music' : 'book',
});

export const normalizeShelfItem = (item = {}) => ({
  id: item.id,
  type: item.type,
  title: item.title || 'Chưa có tiêu đề',
  author: item.author || 'Soundbook',
  image: item.image,
  itemId: item.itemId,
  previewUrl: item.previewUrl,
  visibility: item.visibility || 'PUBLIC',
  style: item.type === 'music'
    ? 'rounded-md shrink-0 aspect-square w-24 sm:w-32'
    : 'rounded-sm shrink-0 w-16 sm:w-20 h-28 sm:h-36',
  rating: item.rating,
  progress: item.progress,
  original: item,
});
