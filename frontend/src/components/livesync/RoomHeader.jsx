import React, { useState } from 'react';
import { Users, Settings, Share2, Check, LogOut, Home, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useRoomSession } from '../../context/RoomSessionContext';
import { leaveRoom } from '../../services/room';
import { getCurrentUser } from '../../services/auth';
import ReportModal from '../common/ReportModal';

const RoomHeader = ({ membersCount, roomName, roomId, visible = true }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { closeSession } = useRoomSession();
  const [isCopied, setIsCopied] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  const handleLeaveRoom = async () => {
    // Inform backend that this user left so it can promote a new host
    try {
      const user = getCurrentUser();
      if (roomId && user?.id) {
        await leaveRoom(roomId, user.id);
      }
    } catch (e) {
      // Ignore "Room member not found" (404) errors as it just means they were already kicked/left
      if (e?.response?.status !== 404 && e?.message !== 'Room member not found') {
        console.error('Error leaving room:', e);
      }
    } finally {
      // Now fully close local session and disconnect
      closeSession();
      navigate('/feed');
    }
  };

  const handleBackToHome = () => {
    navigate('/feed');
  };

  return (
    <>
      <div className={`absolute top-0 left-0 w-full p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent transition-all duration-500 transform ${visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}>
        <div className="text-white pointer-events-auto">
          <h2 className="font-bold text-lg drop-shadow-md">{roomName || 'Live Room'}</h2>
          {roomId && <p className="text-[11px] text-white/80 drop-shadow-md">ID: {roomId}</p>}
          <p className="text-xs text-white/80 drop-shadow-md flex items-center gap-1">
            <Users size={12} /> {membersCount} {t('room.listening')}
          </p>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <button 
            onClick={handleShare}
            title="Chia sẻ phòng"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-500/80 hover:bg-primary-600 text-white backdrop-blur-md transition-colors text-sm font-medium shadow-lg"
          >
            {isCopied ? <Check size={16} /> : <Share2 size={16} />}
            <span className="hidden sm:inline">{isCopied ? 'Đã chép link!' : 'Chia sẻ'}</span>
          </button>
          <button 
            onClick={() => setIsReportModalOpen(true)}
            title="Báo cáo phòng"
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-colors shadow-lg pointer-events-auto"
          >
            <Flag size={18} />
          </button>
          <button 
            onClick={handleBackToHome}
            title="Về trang chủ"
            className="p-2 rounded-full bg-blue-500/80 hover:bg-blue-600 text-white backdrop-blur-md transition-colors shadow-lg"
          >
            <Home size={18} />
          </button>
          <button 
            onClick={handleLeaveRoom}
            title="Rời khỏi phòng"
            className="p-2 rounded-full bg-red-500/80 hover:bg-red-600 text-white backdrop-blur-md transition-colors shadow-lg"
          >
            <LogOut size={18} />
          </button>
          <button className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-colors shadow-lg">
            <Settings size={18} />
          </button>
        </div>
      </div>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        type="ROOM"
        targetId={roomId}
      />
    </>
  );
};

export default RoomHeader;
