import React, { useState } from 'react';
import { MoreHorizontal, Plus, UserMinus, ShieldBan, Check, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { kickUser, banUser, approveUser, rejectUser } from '../../services/room';
import { useToast } from '../../context/ToastContext';

const RoomMembers = ({ members, pendingMembers = [], isHost, roomId, hostUserId }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [activeMenuId, setActiveMenuId] = useState(null);

  const handleAction = async (action, targetUserId) => {
    setActiveMenuId(null);
    try {
      if (action === 'kick') await kickUser(roomId, targetUserId, hostUserId);
      if (action === 'ban') await banUser(roomId, targetUserId, hostUserId);
      if (action === 'approve') await approveUser(roomId, targetUserId, hostUserId);
      if (action === 'reject') await rejectUser(roomId, targetUserId, hostUserId);
      showToast('Đã thực hiện thao tác', 'success');
    } catch (e) {
      console.error(e);
      showToast('Có lỗi xảy ra', 'error');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50/50 dark:bg-black/10">
      
      {/* Pending Members Section (Only Host sees this) */}
      {isHost && pendingMembers.length > 0 && (
        <div className="mb-6">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Chờ duyệt ({pendingMembers.length})</h4>
          <div className="space-y-3">
            {pendingMembers.map(member => (
              <div key={member.id || member.userId} className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl transition-colors border border-yellow-100 dark:border-yellow-900/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 relative overflow-hidden">
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt={member.displayName || member.name} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <span className="font-medium text-sm">
                    {member.displayName || member.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleAction('approve', member.userId)} className="w-7 h-7 rounded-full bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 flex items-center justify-center transition-colors">
                    <Check size={14} />
                  </button>
                  <button onClick={() => handleAction('reject', member.userId)} className="w-7 h-7 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 flex items-center justify-center transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Members Section */}
      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Thành viên ({members.length})</h4>
      <div className="space-y-3">
        {members.map(member => (
          <div key={member.id || member.userId} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors relative">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 relative overflow-hidden">
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt={member.displayName || member.name} className="w-full h-full object-cover" />
                ) : null}
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-surface-color" />
              </div>
              <span className="font-medium text-sm">
                {member.displayName || member.name}
                {(member.role === 'HOST' || member.isHost) && <span className="text-xs text-primary-500 ml-1 font-semibold">({t('room.host')}) </span>}
              </span>
            </div>
            
            {/* Host Actions Menu */}
            {isHost && member.role !== 'HOST' && (
              <div className="relative">
                <button 
                  onClick={() => setActiveMenuId(activeMenuId === member.userId ? null : member.userId)}
                  className="text-text-muted hover:text-text-color p-1"
                >
                  <MoreHorizontal size={16} />
                </button>
                
                {activeMenuId === member.userId && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setActiveMenuId(null)} />
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-1 z-[70] animate-in fade-in zoom-in-95 duration-200">
                      <button 
                        onClick={() => handleAction('kick', member.userId)} 
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                      >
                        <UserMinus size={14} /> Mời ra
                      </button>
                      <button 
                        onClick={() => handleAction('ban', member.userId)} 
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors mt-0.5"
                      >
                        <ShieldBan size={14} /> Cấm cửa
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        <button className="w-full mt-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-sm font-medium text-text-muted hover:text-primary-500 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors flex items-center justify-center gap-2">
          <Plus size={16} /> {t('room.invite_friends')}
        </button>
      </div>
    </div>
  );
};

export default RoomMembers;
