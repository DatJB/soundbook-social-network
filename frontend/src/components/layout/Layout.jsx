import { Outlet } from 'react-router-dom';
import Header from './Header';
import MiniPlayer from '../livesync/MiniPlayer';
import MusicPlayerOverlay from '../newsfeed/MusicPlayerOverlay';
import { useMusicPlayer } from '../../context/MusicPlayerContext';

const MusicOverlayBridge = () => {
  const { currentTrack, isPlaying, playerRef, togglePlay, stopTrack } = useMusicPlayer();
  if (!currentTrack) return null;
  return (
    <MusicPlayerOverlay
      post={currentTrack}
      playerRef={playerRef}
      isPlaying={isPlaying}
      onTogglePlay={togglePlay}
      onClose={stopTrack}
    />
  );
};

const Layout = () => {
  return (
    <div className="min-h-screen bg-bg-color text-text-color flex flex-col transition-colors duration-300">
      <Header />
      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
      <MiniPlayer />
      {/* Global music overlay – persists across navigation */}
      <MusicOverlayBridge />
    </div>
  );
};

export default Layout;
