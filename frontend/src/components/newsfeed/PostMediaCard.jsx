import { Play, Pause, BookOpen } from 'lucide-react';
import YouTube from 'react-youtube';

const Cover = ({ url, className, fallbackClass, children }) => {
  if (url) {
    return <img src={url} alt="cover" className={`${className} object-cover`} />;
  }
  return <div className={`${className} ${fallbackClass} flex items-center justify-center text-white`}>{children}</div>;
};

const PostMediaCard = ({ post, isPlaying, onTogglePlay }) => {
  if (!post?.media) return null;

  const isVideo = post.media?.mediaType === 'VIDEO' || post.media?.coverUrl?.match(/\.(mp4|webm|ogg|mov)$|video\/upload/i);
  
  // YouTube detection logic
  const videoId = post.media?.id || post.media?.ref?.id || post.media?.ref?.videoId;

  if (isVideo && videoId) {
    if (isPlaying) {
      return (
        <div className="mb-4 rounded-2xl overflow-hidden aspect-video relative group bg-black shadow-lg">
          <YouTube
            videoId={videoId}
            containerClassName="w-full h-full"
            className="w-full h-full"
            opts={{
              width: '100%',
              height: '100%',
              playerVars: {
                autoplay: 1,
                modestbranding: 1,
                rel: 0,
              },
            }}
            onEnd={onTogglePlay}
          />
        </div>
      );
    }

    return (
      <div className="mb-4 rounded-2xl overflow-hidden aspect-video relative group cursor-pointer" onClick={onTogglePlay}>
        <Cover url={post.media.coverUrl} className="w-full h-full group-hover:scale-105 transition-transform duration-500" fallbackClass="bg-black">
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/40 transition-colors">
            <div className="w-16 h-16 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-transform">
              <Play size={32} fill="currentColor" className="ml-1" />
            </div>
          </div>
        </Cover>
      </div>
    );
  }

  if (isVideo && post.media?.coverUrl) {
    return (
      <div className="mb-4 rounded-2xl overflow-hidden aspect-video relative group">
        <video 
          src={post.media.coverUrl} 
          className="w-full h-full object-contain" 
          controls
          playsInline
        />
      </div>
    );
  }

  const isAudio = post.type === 'audio' || post.type === 'music_quick_note';

  if (isAudio) {
    // Try to extract artist from title like "Artist - Song Title"
    const rawArtist = post.media.artist || '';
    const artist = rawArtist && rawArtist !== 'Soundbook'
      ? rawArtist
      : (() => {
          const title = post.media.title || '';
          const dashIdx = title.indexOf(' - ');
          return dashIdx > 0 ? title.substring(0, dashIdx).trim() : '';
        })();

    return (
      <div className={`flex items-center gap-4 rounded-xl p-3 mb-4 transition-all duration-300 ${isPlaying ? 'bg-primary-500/10 dark:bg-primary-500/15 ring-1 ring-primary-500/30' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
        {/* Cover with spinning disc effect when playing */}
        <div className={`w-16 h-16 rounded-lg flex-shrink-0 shadow-md overflow-hidden ${isPlaying ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''}`}>
          <Cover
            url={post.media.coverUrl}
            className={`w-full h-full transition-transform duration-[3000ms] ${isPlaying ? 'scale-110' : 'scale-100'}`}
            fallbackClass={post.media.cover || 'bg-gradient-to-br from-purple-500 to-indigo-600'}
          >
            ♪
          </Cover>
        </div>

        <div className="flex-1 min-w-0">
          {/* Now playing badge */}
          {isPlaying && (
            <div className="flex items-center gap-1.5 mb-1">
              <div className="flex gap-[2px] items-end h-3">
                {[0.8, 1, 0.6, 0.9, 0.5].map((h, i) => (
                  <div
                    key={i}
                    className="w-[2px] rounded-full bg-primary-500"
                    style={{
                      height: `${h * 100}%`,
                      animation: `eqCardBar${i} ${0.38 + i * 0.07}s ease-in-out infinite alternate`,
                    }}
                  />
                ))}
              </div>
              <span className="text-[10px] font-bold text-primary-500 uppercase tracking-wide">Đang phát</span>
            </div>
          )}

          <h5 className="font-bold text-sm truncate">{post.media.title}</h5>
          {artist && <p className="text-xs text-text-muted truncate mt-0.5">{artist}</p>}

          {/* Progress bar */}
          <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isPlaying ? 'bg-gradient-to-r from-primary-500 to-purple-500' : 'bg-primary-400/50 w-1/3'}`}
              style={isPlaying ? { width: '100%', backgroundSize: '200% 100%', animation: 'gradientSlide 2s linear infinite' } : {}}
            />
          </div>
        </div>

        {/* Play / Pause button */}
        <button
          onClick={onTogglePlay}
          className={`w-11 h-11 rounded-full text-white flex items-center justify-center flex-shrink-0 transition-all duration-200 shadow-lg hover:scale-110 active:scale-95 ${isPlaying ? 'bg-primary-600 shadow-primary-500/30' : 'bg-primary-500 shadow-primary-500/20 hover:bg-primary-600'}`}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
        </button>

        {/* Inline keyframes for eq bars */}
        <style>{`
          @keyframes eqCardBar0 { from { height: 30% } to { height: 80% } }
          @keyframes eqCardBar1 { from { height: 50% } to { height: 100% } }
          @keyframes eqCardBar2 { from { height: 40% } to { height: 60% } }
          @keyframes eqCardBar3 { from { height: 20% } to { height: 90% } }
          @keyframes eqCardBar4 { from { height: 60% } to { height: 50% } }
          @keyframes gradientSlide {
            0%   { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
          }
        `}</style>
      </div>
    );
  }

  const isBlog = post.type === 'blog';

  if (isBlog) {
    if (!post.media?.coverUrl) return null;
    return (
      <div className="mb-4 rounded-2xl overflow-hidden">
        <img 
          src={post.media.coverUrl} 
          alt={post.media.title}
          className="w-full h-auto max-h-[600px] object-contain mx-auto" 
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-4">
      <Cover url={post.media.coverUrl} className="w-20 h-28 rounded-md flex-shrink-0 shadow-md" fallbackClass={post.media.cover || 'bg-gradient-to-br from-orange-400 to-red-600'}>
        <BookOpen size={28} />
      </Cover>
      <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
        <h5 className="font-bold text-base leading-tight truncate">{post.media.title}</h5>
        <p className="text-sm text-text-muted truncate">{post.media.author}</p>
        {post.media.rating ? (
          <div className="flex items-center text-yellow-400 text-sm mt-1">
            {'★'.repeat(Math.min(5, post.media.rating))}
            <span className="text-xs text-text-muted ml-1.5">{post.media.rating}/5</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PostMediaCard;
