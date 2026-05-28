import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Disc3, BookOpen, Pause, Play, Flag, MoreVertical, Trash2, XCircle, Ban } from 'lucide-react';
import ReportModal from '../common/ReportModal';
import ConfirmDialog from '../common/ConfirmDialog';
import { useLanguage } from '../../context/LanguageContext';

const ChatMessage = ({ msg, playingId, setPlayingId, isUserOnline = false, onDelete }) => {
  const { t } = useLanguage();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [deleteMode, setDeleteMode] = useState(null);

  const confirmDelete = () => {
    if (deleteMode) {
      onDelete(msg.id, deleteMode);
      setDeleteMode(null);
    }
  };

  return (
    <div className={`flex gap-3 max-w-[85%] sm:max-w-[70%] ${msg.isMe ? 'ml-auto flex-row-reverse' : ''}`}>
      {!msg.isMe && (
        <Link to={`/profile/${msg.userId}`} className="w-8 h-8 rounded-full flex-shrink-0 shadow-sm self-end relative hover:opacity-80 transition-opacity">
          {msg.avatarUrl ? (
            <img 
              src={msg.avatarUrl} 
              alt={msg.user} 
              className="w-full h-full rounded-full object-cover" 
            />
          ) : (
            <div className={`w-full h-full rounded-full ${msg.avatar} flex items-center justify-center text-[10px] text-white font-bold`}>
              {msg.user.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>
      )}
      <div className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
        {!msg.isMe && (
          <div className="flex items-center gap-2 ml-1 mb-1">
            <Link to={`/profile/${msg.userId}`} className="text-[10px] text-text-muted hover:text-primary-500 transition-colors font-medium">
              {msg.user}
            </Link>
          </div>
        )}

        {/* Message */}
        {msg.messageType === 'DELETED' ? (
          <div className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm italic border flex items-center gap-2 ${msg.isMe ? 'bg-transparent text-primary-300 border-primary-200' : 'bg-transparent text-gray-400 border-gray-200 dark:border-gray-700'}`}>
            <Ban size={14} /> Tin nhắn đã bị thu hồi
          </div>
        ) : msg.text ? (
          <div className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm ${msg.isMe ? 'bg-primary-500 text-white rounded-br-sm' : 'bg-gray-100 dark:bg-gray-800 text-text-color rounded-bl-sm'}`}>
            {msg.text}
          </div>
        ) : null}

        {/* Audio/Book */}
        {msg.media && msg.messageType !== 'DELETED' && (
          <div className={`mt-1 bg-surface-color border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex gap-3 shadow-md w-64 ${msg.isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
            <div className={`w-14 h-14 rounded-lg flex-shrink-0 flex items-center justify-center relative overflow-hidden ${msg.media.cover}`}>
              <div className="absolute inset-0 bg-black/20" />
              {msg.type === 'audio' ? <Disc3 size={24} className="text-white z-10 opacity-50" /> : <BookOpen size={24} className="text-white z-10 opacity-50" />}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="font-bold text-sm truncate">{msg.media.title}</p>
              <p className="text-[10px] text-text-muted truncate">{msg.type === 'audio' ? msg.media.artist : msg.media.author}</p>
              {msg.type === 'audio' && (
                <button
                  onClick={() => setPlayingId(playingId === msg.id ? null : msg.id)}
                  className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center mt-1 hover:bg-primary-600 transition-colors"
                >
                  {playingId === msg.id ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" className="ml-0.5" />}
                </button>
              )}
              {msg.type === 'book' && (
                <button className="text-[10px] font-bold text-orange-500 mt-1 hover:underline">Đọc sách</button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-1 mx-1">
          <span className="text-[10px] text-gray-400">{msg.time}</span>
          {!msg.isMe && (
            <button 
              onClick={() => {
                console.log('Opening report for message:', msg);
                setIsReportModalOpen(true);
              }}
              className="text-gray-400 hover:text-rose-500 transition-colors"
              title="Báo cáo tin nhắn"
            >
              <Flag size={14} />
            </button>
          )}
        </div>
      </div>

      {msg.isMe && msg.messageType !== 'DELETED' && (
        <div className="flex flex-col justify-center relative">
          <button onClick={() => setShowMenu(!showMenu)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <MoreVertical size={14} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setShowMenu(false)} />
              <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-1 z-[70] animate-in fade-in zoom-in-95 duration-200">
                <button 
                  onClick={() => { setShowMenu(false); setDeleteMode('forMe'); }} 
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-text-color hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Trash2 size={14} /> Xóa ở phía tôi
                </button>
                <button 
                  onClick={() => { setShowMenu(false); setDeleteMode('forEveryone'); }} 
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors mt-0.5"
                >
                  <XCircle size={14} /> Thu hồi
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteMode}
        danger={true}
        title={deleteMode === 'forEveryone' ? 'Thu hồi tin nhắn' : 'Xóa tin nhắn'}
        message={deleteMode === 'forEveryone' ? 'Bạn có chắc chắn muốn thu hồi tin nhắn này với mọi người không?' : 'Bạn có chắc chắn muốn xóa tin nhắn này ở phía bạn không? Tin nhắn vẫn sẽ hiển thị với người khác.'}
        confirmLabel={deleteMode === 'forEveryone' ? 'Thu hồi' : 'Xóa'}
        onClose={() => setDeleteMode(null)}
        onConfirm={confirmDelete}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        type="DM_MESSAGE"
        targetId={msg.id || msg.messageId}
      />
    </div>
  );
};

export default ChatMessage;
