import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  Play, Pause, Volume2, VolumeX, X, Music,
  SkipBack, SkipForward, ChevronDown,
} from 'lucide-react';

/* ─── Helpers ─────────────────────────────────────────── */
const fmt = (sec) => {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/* ─── Equalizer bars (animated when playing) ──────────── */
const EqBars = ({ active }) => (
  <div className="flex items-end gap-[2px] h-4">
    {[1, 0.6, 0.9, 0.4, 0.75].map((h, i) => (
      <div
        key={i}
        className="w-[3px] rounded-full bg-white transition-all"
        style={{
          height: active ? `${h * 100}%` : '30%',
          animation: active ? `eqBar${i + 1} ${0.4 + i * 0.08}s ease-in-out infinite alternate` : 'none',
          opacity: active ? 1 : 0.4,
        }}
      />
    ))}
  </div>
);

/* ─── Main Component ──────────────────────────────────── */
const MusicPlayerOverlay = ({ post, playerRef, isPlaying, onTogglePlay, onClose }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [volume, setVolume]           = useState(100);
  const [muted, setMuted]             = useState(false);
  const [draggingSeek, setDraggingSeek] = useState(false);
  const [seekValue, setSeekValue]     = useState(0);
  const [visible, setVisible]         = useState(false);
  const [minimized, setMinimized]     = useState(false);
  const intervalRef = useRef(null);

  /* mount animation */
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  /* sync volume/mute to player when state changes */
  useEffect(() => {
    if (!playerRef?.current) return;
    try {
      if (muted) {
        playerRef.current.mute?.();
      } else {
        playerRef.current.unMute?.();
        playerRef.current.setVolume?.(volume);
      }
    } catch (_) { /* ignore */ }
  }, [volume, muted, playerRef]);

  /* poll current time & duration */
  useEffect(() => {
    const poll = () => {
      try {
        const p = playerRef?.current;
        if (!p) return;
        const cur = p.getCurrentTime?.() ?? 0;
        const dur = p.getDuration?.() ?? 0;
        if (!draggingSeek) {
          setCurrentTime(cur);
          setSeekValue(cur);
        }
        setDuration(dur);
      } catch (_) { /* ignore */ }
    };

    if (isPlaying) {
      poll();
      intervalRef.current = setInterval(poll, 500);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, playerRef, draggingSeek]);

  const handleSeekChange = (e) => {
    setSeekValue(Number(e.target.value));
  };

  const handleSeekCommit = (e) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    setDraggingSeek(false);
    try { playerRef?.current?.seekTo?.(val, true); } catch (_) { /* ignore */ }
  };

  const handleVolumeChange = (e) => {
    const val = Number(e.target.value);
    setVolume(val);
    setMuted(val === 0);
  };

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 280);
  }, [onClose]);

  const handleToggleMute = () => {
    setMuted((prev) => !prev);
  };

  /* media info */
  const cover  = post?.media?.coverUrl || post?.media?.thumbnail || '';
  const title  = post?.media?.title || post?.content || 'Đang phát nhạc';
  const rawArtist = post?.media?.artist || '';
  const artist = rawArtist && rawArtist !== 'Soundbook'
    ? rawArtist
    : (() => {
        const t = post?.media?.title || '';
        const i = t.indexOf(' - ');
        return i > 0 ? t.substring(0, i).trim() : (post?.user?.name || '');
      })();

  const progress = duration > 0 ? (seekValue / duration) * 100 : 0;

  const overlay = (
    <>
      {/* Keyframe styles injected once */}
      <style>{`
        @keyframes eqBar1 { from { height: 20% } to { height: 100% } }
        @keyframes eqBar2 { from { height: 40% } to { height: 70% } }
        @keyframes eqBar3 { from { height: 30% } to { height: 90% } }
        @keyframes eqBar4 { from { height: 50% } to { height: 65% } }
        @keyframes eqBar5 { from { height: 25% } to { height: 80% } }
        @keyframes slideUpOverlay {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes slideDownOverlay {
          from { transform: translateY(0);    opacity: 1; }
          to   { transform: translateY(100%); opacity: 0; }
        }
        .music-overlay-enter { animation: slideUpOverlay   0.28s cubic-bezier(0.16,1,0.3,1) forwards; }
        .music-overlay-exit  { animation: slideDownOverlay 0.25s ease-in              forwards; }

        .seek-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 0 4px rgba(0,0,0,0.4);
          cursor: pointer;
          transition: transform 0.15s;
        }
        .seek-thumb::-webkit-slider-thumb:hover { transform: scale(1.25); }
        .seek-thumb::-moz-range-thumb {
          width: 14px; height: 14px;
          background: white;
          border-radius: 50%;
          border: none;
          box-shadow: 0 0 4px rgba(0,0,0,0.4);
          cursor: pointer;
        }
        .vol-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px; height: 12px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
        }
        .vol-thumb::-moz-range-thumb {
          width: 12px; height: 12px;
          background: white;
          border-radius: 50%;
          border: none;
          cursor: pointer;
        }
      `}</style>

      <div
        className={`fixed bottom-4 right-4 z-[200] w-[min(420px,calc(100vw-32px))] ${visible ? 'music-overlay-enter' : 'music-overlay-exit'}`}
        style={{ filter: 'drop-shadow(0 8px 32px rgba(99,77,255,0.35))' }}
      >
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(99,77,255,0.92) 0%, rgba(139,92,246,0.95) 50%, rgba(79,70,229,0.92) 100%)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.18)',
          }}
        >
          {/* Background blurred cover art */}
          {cover && (
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `url(${cover})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(20px)',
                transform: 'scale(1.1)',
              }}
            />
          )}

          <div className="relative z-10">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div className="flex items-center gap-1.5 text-white/60 text-[11px] font-semibold tracking-wider uppercase">
                <Music size={11} />
                <span>Đang phát</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMinimized(p => !p)}
                  className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title={minimized ? 'Mở rộng' : 'Thu nhỏ'}
                >
                  <ChevronDown
                    size={15}
                    className="transition-transform duration-200"
                    style={{ transform: minimized ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title="Đóng player"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Main content */}
            <div className={`overflow-hidden transition-all duration-300 ${minimized ? 'max-h-0' : 'max-h-[200px]'}`}>
              <div className="px-4 pb-4">
                {/* Song info row */}
                <div className="flex items-center gap-3 mb-3">
                  {/* Cover */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 shadow-lg ring-2 ring-white/20">
                    {cover ? (
                      <img src={cover} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/20 flex items-center justify-center">
                        <Music size={20} className="text-white" />
                      </div>
                    )}
                  </div>

                  {/* Title + artist */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate leading-tight">{title}</p>
                    {artist && <p className="text-white/65 text-xs truncate mt-0.5">{artist}</p>}
                  </div>

                  {/* Equalizer */}
                  <EqBars active={isPlaying} />
                </div>

                {/* Seek bar */}
                <div className="mb-2">
                  <div className="relative h-1.5 rounded-full bg-white/20 mb-1 overflow-visible">
                    {/* progress fill */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-white/80 pointer-events-none transition-all"
                      style={{ width: `${progress}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.5}
                      value={seekValue}
                      onChange={handleSeekChange}
                      onMouseDown={() => setDraggingSeek(true)}
                      onTouchStart={() => setDraggingSeek(true)}
                      onMouseUp={handleSeekCommit}
                      onTouchEnd={handleSeekCommit}
                      className="seek-thumb absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      style={{ margin: 0, padding: 0 }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-white/50 font-mono">
                    <span>{fmt(currentTime)}</span>
                    <span>{fmt(duration)}</span>
                  </div>
                </div>

                {/* Controls row */}
                <div className="flex items-center gap-3">
                  {/* Skip back (10s) */}
                  <button
                    onClick={() => {
                      const t = Math.max(0, (currentTime) - 10);
                      setSeekValue(t);
                      setCurrentTime(t);
                      try { playerRef?.current?.seekTo?.(t, true); } catch (_) {}
                    }}
                    className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    title="Tua lại 10 giây"
                  >
                    <SkipBack size={18} />
                  </button>

                  {/* Play / Pause */}
                  <button
                    onClick={onTogglePlay}
                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform flex-shrink-0"
                    title={isPlaying ? 'Dừng' : 'Phát'}
                  >
                    {isPlaying
                      ? <Pause size={18} fill="rgb(99,77,255)" className="text-[rgb(99,77,255)]" />
                      : <Play  size={18} fill="rgb(99,77,255)" className="text-[rgb(99,77,255)] ml-0.5" />
                    }
                  </button>

                  {/* Skip forward (10s) */}
                  <button
                    onClick={() => {
                      const t = Math.min(duration, (currentTime) + 10);
                      setSeekValue(t);
                      setCurrentTime(t);
                      try { playerRef?.current?.seekTo?.(t, true); } catch (_) {}
                    }}
                    className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    title="Tua tới 10 giây"
                  >
                    <SkipForward size={18} />
                  </button>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Mute button */}
                  <button
                    onClick={handleToggleMute}
                    className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                    title={muted ? 'Bật âm' : 'Tắt âm'}
                  >
                    {muted || volume === 0
                      ? <VolumeX size={16} />
                      : <Volume2 size={16} />
                    }
                  </button>

                  {/* Volume slider */}
                  <div className="relative w-20 h-4 flex items-center">
                    <div className="absolute inset-y-[5px] left-0 right-0 rounded-full bg-white/20" />
                    <div
                      className="absolute inset-y-[5px] left-0 rounded-full bg-white/70 pointer-events-none"
                      style={{ width: `${muted ? 0 : volume}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={muted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="vol-thumb absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      style={{ margin: 0, padding: 0 }}
                      title={`Âm lượng: ${muted ? 0 : volume}%`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Minimized single-line view */}
            {minimized && (
              <div className="flex items-center gap-3 px-4 pb-3">
                <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
                  {cover
                    ? <img src={cover} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-white/20 flex items-center justify-center"><Music size={12} className="text-white" /></div>
                  }
                </div>
                <p className="flex-1 text-white text-xs font-semibold truncate">{title}</p>
                <EqBars active={isPlaying} />
                <button
                  onClick={onTogglePlay}
                  className="w-7 h-7 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
                >
                  {isPlaying
                    ? <Pause size={12} fill="rgb(99,77,255)" className="text-[rgb(99,77,255)]" />
                    : <Play  size={12} fill="rgb(99,77,255)" className="text-[rgb(99,77,255)] ml-0.5" />
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(overlay, document.body);
};

export default MusicPlayerOverlay;
