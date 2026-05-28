import React, { useState } from 'react';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';

const ProfileShelves = ({ t, shelves, isGuest = false, onAddItem, onEditItem, onDeleteItem }) => {
  const [editingShelfId, setEditingShelfId] = useState(null);

  const toggleEdit = (shelfId) => {
    setEditingShelfId(prev => prev === shelfId ? null : shelfId);
  };

  return (
    <div className="space-y-16">
      {shelves.map((shelf, shelfIndex) => {
        const isEditing = editingShelfId === shelf.id;
        return (
          <div key={shelf.id} className="relative" style={{ zIndex: 100 - shelfIndex }}>
            <h3 className="text-lg font-bold text-text-muted mb-6 px-2 flex items-center gap-3">
              {shelf.title}
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1" />
              {!isGuest && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button title={t('common.add', { defaultValue: 'Add' })} className="p-1.5 rounded-lg text-text-muted hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors" onClick={() => onAddItem?.(shelf.id)}>
                    <Plus size={15} />
                  </button>
                  <button title={isEditing ? t('common.done', { defaultValue: 'Done' }) : t('common.edit', { defaultValue: 'Edit' })} className={`p-1.5 rounded-lg transition-colors ${isEditing ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'text-text-muted hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20'}`} onClick={() => toggleEdit(shelf.id)}>
                    {isEditing ? <Check size={15} /> : <Pencil size={15} />}
                  </button>
                </div>
              )}
            </h3>

            <div className="flex gap-x-6 sm:gap-x-10 gap-y-12 flex-wrap items-end px-10 sm:px-12 min-h-[160px]">
              {shelf.items.map((item, itemIndex) => (
                <div key={item.id} className="relative cursor-pointer group perspective-1000 transition-transform hover:-translate-y-2 hover:scale-105" style={{ zIndex: 100 - itemIndex }}>
                  {isEditing && (
                    <div className="absolute -top-3 -right-3 z-40 flex gap-1">
                      <button className="w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-md hover:bg-primary-600 transition-colors" title="Sửa" onClick={(e) => { e.stopPropagation(); onEditItem?.(shelf.id, item); }}>
                        <Pencil size={12} />
                      </button>
                      <button className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors" title="Xóa" onClick={(e) => { e.stopPropagation(); onDeleteItem?.(shelf.id, item); }}>
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  <div className={`shadow-lg drop-shadow-lg dark:shadow-black/60 group-hover:shadow-2xl border border-gray-200/50 dark:border-gray-700/50 transition-shadow duration-300 ${item.style} ${!item.image ? 'flex items-center justify-center text-white/90 drop-shadow-sm text-sm font-bold text-center p-2 break-words leading-tight' : 'overflow-hidden'}`}>
                    {item.image ? <img src={item.image} alt={item.title} className="w-full h-full object-cover" style={item.type === 'music' ? { transform: 'scale(1.35)' } : {}} /> : item.title}
                  </div>

                  {item.progress !== undefined && item.progress !== null && (
                    <div className="absolute -bottom-5 w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}

                  <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                    <div className="bg-surface-color text-text-color rounded-xl shadow-2xl p-3 text-sm w-48 border border-gray-200 dark:border-gray-700 transform scale-95 group-hover:scale-100 transition-transform">
                      <p className="font-bold break-words leading-snug">{item.title}</p>
                      <p className="text-text-muted text-xs break-words mb-1">{item.author}</p>
                      {item.rating ? <div className="flex text-yellow-500 text-[10px]">{'★'.repeat(item.rating)}</div> : null}
                    </div>
                    <div className="w-3 h-3 bg-surface-color border-t border-l border-gray-200 dark:border-gray-700 absolute -top-1.5 left-1/2 -translate-x-1/2 rotate-45" />
                  </div>
                </div>
              ))}

              {!shelf.items.length ? (
                isGuest ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm font-semibold text-text-muted dark:border-gray-700">
                    Chưa có mục nào
                  </div>
                ) : (
                  <button onClick={() => onAddItem?.(shelf.id)} className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-sm font-semibold text-text-muted hover:border-primary-500 hover:text-primary-500 dark:border-gray-700">
                    <Plus className="mx-auto mb-2" size={22} /> Thêm mục đầu tiên
                  </button>
                )
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ProfileShelves;
