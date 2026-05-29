import React, { useState, useEffect, useRef } from 'react';
import { Heart, Smile } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { resolveUrl } from '../../services/auth';

const RoomChat = ({ chatMessages, chatInput, setChatInput, onSendMessage, isSending = false }) => {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const messagesContainerRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const onEmojiClick = (emojiObject) => {
    setChatInput((prev) => prev + emojiObject.emoji);
  };

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  return (
    <>
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50/50 dark:bg-black/10"
      >
        <div className="flex flex-col gap-4 min-h-full">
          <div className="mt-auto space-y-4">
            {chatMessages.map((msg) => (
              <div key={msg.id} className="flex gap-3">
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold text-[10px] overflow-hidden">
                  {msg.avatar ? (
                    <img
                      src={resolveUrl(msg.avatar)}
                      alt={msg.user}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{(msg.user || 'U').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-xs text-text-muted">{msg.user}</span>
                  <p className="text-sm bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-2xl rounded-tl-sm text-text-color inline-block mt-0.5 shadow-sm">
                    {msg.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-surface-color">
        <div className="relative">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendMessage?.();
              }
            }}
            placeholder={t('room.chat_placeholder')}
            className="w-full bg-gray-100 dark:bg-gray-800 border-none outline-none rounded-full py-2.5 pl-4 pr-24 text-sm text-text-color placeholder-gray-500"
          />
          <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${showEmojiPicker ? 'text-primary-500 bg-primary-500/10' : 'text-gray-500 hover:text-primary-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              <Smile size={18} />
            </button>
            <button
              disabled={isSending}
              onClick={onSendMessage}
              className="w-8 h-8 rounded-full bg-primary-500 text-white flex items-center justify-center hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Heart size={14} fill="currentColor" />
            </button>
          </div>

          {showEmojiPicker && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setShowEmojiPicker(false)} />
              <div className="absolute bottom-full right-0 mb-2 z-[70] shadow-2xl rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 animate-in slide-in-from-bottom-2">
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
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
    </>
  );
};

export default RoomChat;
