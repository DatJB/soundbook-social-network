import React from 'react';
import { ArrowLeft, Edit3, User, AlignLeft, Music, ToggleRight, ToggleLeft, Save, Info, Search, Heart, Eye } from 'lucide-react';

const VISIBILITY_OPTIONS = [
  { value: 'PUBLIC', label: 'Công khai' },
  { value: 'FOLLOWERS', label: 'Người theo dõi' },
  { value: 'FRIENDS', label: 'Bạn bè' },
  { value: 'PRIVATE', label: 'Chỉ mình tôi' },
];

const VisibilitySelect = ({ value, onChange, label }) => (
  <div className="mt-2">
    <label className="block text-[11px] font-semibold text-text-muted mb-1">{label}</label>
    <select
      value={value || 'PUBLIC'}
      onChange={onChange}
      className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
    >
      {VISIBILITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>
);

const VisibilityPill = ({ value }) => {
  const label = VISIBILITY_OPTIONS.find(option => option.value === value)?.label || 'Công khai';
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-text-muted dark:bg-gray-800">
      <Eye size={11} /> {label}
    </span>
  );
};

const ReadOnlyBlock = ({ icon: Icon, title, children, visibility }) => {
  if (!children) return null;
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/40">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-text-muted">
          <Icon size={14} /> {title}
        </div>
        {visibility ? <VisibilityPill value={visibility} /> : null}
      </div>
      <div className="whitespace-pre-line text-sm leading-relaxed text-text-color">{children}</div>
    </div>
  );
};

const PersonalInfo = ({
  t,
  isGuest,
  profileData,
  isEditingInfo,
  setIsEditingInfo,
  formData,
  handleInputChange,
  handleTogglePreview,
  handleSaveInfo,
  lastUpdate,
  onOpenPinnedTrackSearch,
}) => {
  const handleVisibilityChange = (name) => (event) => {
    handleInputChange({ target: { name, value: event.target.value } });
  };

  const hasPublicContent = Boolean(formData.bio || formData.publicInfo || profileData?.matchReasons?.length);

  return (
    <div className={`bg-surface-color rounded-2xl ${isEditingInfo ? 'p-5' : 'px-5 py-4'} shadow-sm border border-gray-200 dark:border-gray-800 transition-all duration-300`}>
      <div className={`flex items-center justify-between ${isEditingInfo ? 'mb-4' : 'mb-0'}`}>
        <h3 className="font-bold text-sm uppercase tracking-wider text-text-muted">{t('profile.personal_info', { defaultValue: 'Personal Information' })}</h3>
        {!isGuest && (
          <button onClick={() => setIsEditingInfo(!isEditingInfo)} className="text-text-muted hover:text-text-color transition-colors" title={isEditingInfo ? 'Quay lại' : 'Chỉnh sửa'}>
            {isEditingInfo ? <ArrowLeft size={16} /> : <Edit3 size={16} />}
          </button>
        )}
      </div>

      {isEditingInfo ? (
        <div className="space-y-4 mt-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div>
            <label className="flex items-center text-xs font-semibold mb-1.5 text-text-muted">
              <User size={14} className="mr-1.5" />
              {t('profile_info.username', { defaultValue: 'Username' })}
            </label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
              placeholder="@username"
            />
          </div>

          <div>
            <label className="flex items-center text-xs font-semibold mb-1.5 text-text-muted">
              <AlignLeft size={14} className="mr-1.5" />
              {t('profile_info.bio', { defaultValue: 'Bio' })}
            </label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleInputChange}
              rows="3"
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none resize-none"
              placeholder={t('profile_info.bio_placeholder', { defaultValue: 'Tell us a little bit about yourself...' })}
            />
            <VisibilitySelect label="Ai được xem mô tả này?" value={formData.bioVisibility} onChange={handleVisibilityChange('bioVisibility')} />
          </div>

          <div>
            <label className="flex items-center text-xs font-semibold mb-1.5 text-text-muted">
              <Info size={14} className="mr-1.5" />
              Thông tin công khai / sở thích nổi bật
            </label>
            <textarea
              name="publicInfo"
              value={formData.publicInfo}
              onChange={handleInputChange}
              rows="3"
              className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none resize-none"
              placeholder="Ví dụ: Mình thích indie, manga trinh thám, fantasy và các playlist chill..."
            />
            <VisibilitySelect label="Ai được xem thông tin này?" value={formData.publicInfoVisibility} onChange={handleVisibilityChange('publicInfoVisibility')} />
          </div>

          <div>
            <label className="flex items-center text-xs font-semibold mb-1.5 text-text-muted">
              <Music size={14} className="mr-1.5" />
              {t('profile_info.pinned_track', { defaultValue: 'Pinned Track / Playlist' })}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                name="pinnedTrack"
                value={formData.pinnedTrack}
                onChange={handleInputChange}
                className="flex-1 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                placeholder="YouTube URL hoặc videoId"
              />
              <button
                type="button"
                onClick={onOpenPinnedTrackSearch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                <Search size={14} /> Chọn
              </button>
            </div>
            <VisibilitySelect label="Ai được nghe nhạc ghim?" value={formData.pinnedTrackVisibility} onChange={handleVisibilityChange('pinnedTrackVisibility')} />
          </div>

          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-xs">{t('profile_info.allow_preview', { defaultValue: 'Allow 15s Preview' })}</h4>
                <p className="text-[11px] text-text-muted mt-0.5">Bật để phát nhạc ghim YouTube trực tiếp trên profile.</p>
              </div>
              <button onClick={handleTogglePreview} className={`transition-colors ${formData.allowPreview ? 'text-primary-500' : 'text-gray-400 dark:text-gray-600'}`}>
                {formData.allowPreview ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
          </div>

          <div className="pt-3 flex flex-col items-center justify-between gap-3">
            <button onClick={handleSaveInfo} className="w-full flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-primary-500/20">
              <Save size={16} />
              {t('common.save', { defaultValue: 'Save Changes' })}
            </button>
            <div className="flex items-center text-[10px] text-text-muted mt-1 w-full justify-center">
              <Info size={12} className="mr-1" />
              {t('profile_info.last_update', { defaultValue: 'Last updated:' })} {lastUpdate}
            </div>
          </div>
        </div>
      ) : isGuest ? (
        <div className="mt-4 space-y-3">
          <ReadOnlyBlock icon={AlignLeft} title="Mô tả" visibility={!isGuest ? formData.bioVisibility : null}>
            {formData.bio}
          </ReadOnlyBlock>

          <ReadOnlyBlock icon={Heart} title="Sở thích nổi bật" visibility={!isGuest ? formData.publicInfoVisibility : null}>
            {formData.publicInfo}
          </ReadOnlyBlock>

          {profileData?.matchReasons?.length ? (
            <div className="rounded-2xl border border-primary-500/10 bg-primary-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary-500">
                <Heart size={14} /> Gu chung
              </div>
              <div className="flex flex-wrap gap-2">
                {profileData.matchReasons.slice(0, 8).map((item) => (
                  <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-300">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {!hasPublicContent ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-text-muted dark:border-gray-800">
              {isGuest ? 'Người dùng này chưa có thông tin công khai.' : 'Bạn chưa cập nhật mô tả hoặc sở thích công khai.'}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default PersonalInfo;
