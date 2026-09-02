import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import YouTube from 'react-youtube';

/**
 * Global Music Player Context
 *
 * Persists across route navigation. Holds a single hidden YouTube IFrame
 * and exposes play/pause/stop controls via hook.
 *
 * currentTrack shape:
 *   {
 *     id:      string | number,   // unique key (post.id or "pinned-{userId}")
 *     media:   { coverUrl, title, artist },
 *     _videoId: string,           // YouTube video ID to load
 *   }
 */

const MusicPlayerContext = createContext(null);

/* ── helpers ────────────────────────────────────────────── */
export const extractVideoId = (post) => {
  if (!post) return null;
  if (post._videoId) return post._videoId;
  if (post.media?.id) return post.media.id;
  const ref = post.media?.ref || {};
  if (ref.id) return ref.id;
  if (ref.videoId) return ref.videoId;
  if (ref.itemId) return ref.itemId;
  const thumb = ref.thumbnail || post.media?.coverUrl || '';
  const m = thumb.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
  if (m) return m[1];
  try {
    const raw = post.original?.refJson;
    if (raw) {
      const parsed = typeof raw === 'object' ? raw : JSON.parse(raw);
      const vid = parsed?.id || parsed?.videoId || parsed?.itemId;
      if (vid) return vid;
      const rt = (parsed?.thumbnail || '').match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
      if (rt) return rt[1];
    }
  } catch { /* ignore */ }
  return null;
};

export const isAudioPost = (post) =>
  post?.type === 'audio' || post?.type === 'music_quick_note';

/* ── Provider ───────────────────────────────────────────── */
export const MusicPlayerProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying]       = useState(false);
  const playerRef                       = useRef(null);

  /* Load a new video when currentTrack changes (and videoId is available) */
  useEffect(() => {
    if (!playerRef.current || !currentTrack?._videoId) return;
    try {
      playerRef.current.unMute?.();
      playerRef.current.setVolume?.(100);
      playerRef.current.loadVideoById(currentTrack._videoId);
    } catch { /* ignore */ }
  }, [currentTrack?._videoId]);

  /**
   * Start playing a track.
   * @param {object} track  – post-like object with id, media, _videoId
   */
  const playTrack = useCallback((track) => {
    if (!track?._videoId) return;

    if (currentTrack?.id === track.id) {
      // Same track – toggle play/pause
      if (isPlaying) {
        try { playerRef.current?.pauseVideo?.(); } catch { /* ignore */ }
        setIsPlaying(false);
      } else {
        try { playerRef.current?.playVideo?.(); } catch { /* ignore */ }
        setIsPlaying(true);
      }
      return;
    }

    // New track
    setCurrentTrack(track);
    setIsPlaying(true);
  }, [currentTrack, isPlaying]);

  const togglePlay = useCallback(() => {
    if (!currentTrack) return;
    if (isPlaying) {
      try { playerRef.current?.pauseVideo?.(); } catch { /* ignore */ }
      setIsPlaying(false);
    } else {
      try { playerRef.current?.playVideo?.(); } catch { /* ignore */ }
      setIsPlaying(true);
    }
  }, [currentTrack, isPlaying]);

  const stopTrack = useCallback(() => {
    try { playerRef.current?.stopVideo?.(); } catch { /* ignore */ }
    setCurrentTrack(null);
    setIsPlaying(false);
  }, []);

  const value = {
    currentTrack,
    isPlaying,
    playerRef,
    playTrack,
    togglePlay,
    stopTrack,
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}

      {/* Single hidden YouTube engine – always mounted, survives navigation */}
      <div className="fixed opacity-0 pointer-events-none" style={{ width: 1, height: 1, bottom: 0, left: 0, zIndex: -1 }}>
        <YouTube
          videoId="dQw4w9WgXcQ"
          opts={{
            playerVars: {
              autoplay: 0,
              controls: 0,
              modestbranding: 1,
              rel: 0,
              origin: typeof window !== 'undefined' ? window.location.origin : '',
            },
          }}
          onReady={(e) => {
            playerRef.current = e.target;
            e.target.unMute();
            e.target.setVolume(100);
          }}
          onEnd={() => {
            setIsPlaying(false);
          }}
          onError={() => {
            setIsPlaying(false);
          }}
        />
      </div>
    </MusicPlayerContext.Provider>
  );
};

/* ── Hook ───────────────────────────────────────────────── */
export const useMusicPlayer = () => {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer must be used inside MusicPlayerProvider');
  return ctx;
};

export default MusicPlayerContext;
