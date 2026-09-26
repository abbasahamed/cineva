import React, { useState } from 'react';
import { X, ToggleLeft, ToggleRight, Trash2, Edit3, Sliders, Shield } from 'lucide-react';
import { RoomInfo } from '@syncwatch/shared';
import { useToast } from './Toast.js';

interface SettingsModalProps {
  room: RoomInfo | null;
  isOpen: boolean;
  isHost: boolean;
  onClose: () => void;
  onUpdateSettings: (settings: { allowGuestControl?: boolean }) => void;
  onUpdateTitle: (title: string) => void;
  onEndRoom: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  room,
  isOpen,
  isHost,
  onClose,
  onUpdateSettings,
  onUpdateTitle,
  onEndRoom,
}) => {
  const { showToast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState(room?.media?.title || '');

  if (!isOpen || !room) return null;

  const handleSaveTitle = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim()) {
      onUpdateTitle(newTitle.trim());
      setEditingTitle(false);
      showToast('Media title updated', 'success');
    }
  };

  const handleToggleGuestControl = () => {
    const nextVal = !room.settings.allowGuestControl;
    onUpdateSettings({ allowGuestControl: nextVal });
    showToast(
      nextVal ? 'Guest controls enabled' : 'Playback restricted to host only',
      'info'
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
    >
      <div className="relative w-full max-w-md bg-[#0e1017]/85 backdrop-blur-2xl border border-white/[0.12] rounded-3xl shadow-glass-elevated p-6 sm:p-7 overflow-hidden glass-reflection animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500/20 to-indigo-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-glass-sm">
              <Sliders className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100 tracking-tight">Room Settings</h3>
              <p className="text-xs text-surface-muted">Manage permissions and room state</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Room Controls (Host Only) */}
          {isHost ? (
            <>
              {/* Allow Guest Controls Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm">
                <div className="pr-4">
                  <span className="text-xs font-semibold text-slate-200 block">
                    Allow Guest Controls
                  </span>
                  <span className="text-[11px] text-surface-muted block mt-0.5">
                    Let all participants play, pause, and seek the video
                  </span>
                </div>
                <button
                  onClick={handleToggleGuestControl}
                  className="text-brand-400 hover:text-brand-300 transition-transform active:scale-90 shrink-0"
                  title="Toggle Guest Controls"
                >
                  {room.settings.allowGuestControl ? (
                    <ToggleRight className="w-8 h-8 text-brand-500 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-600" />
                  )}
                </button>
              </div>

              {/* Edit Media Title */}
              {room.media && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm">
                  <span className="text-[10px] font-semibold text-surface-muted uppercase tracking-wider block mb-2">
                    Media Title
                  </span>
                  {editingTitle ? (
                    <form onSubmit={handleSaveTitle} className="flex gap-2">
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-xl glass-input text-xs text-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 rounded-xl glass-btn-primary text-xs font-semibold text-white shadow-sm"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-200 truncate pr-2 font-medium">{room.media.title}</span>
                      <button
                        onClick={() => setEditingTitle(true)}
                        className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
                        title="Edit title"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Danger Zone: End Room */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to end this room for all participants?')) {
                      onEndRoom();
                      onClose();
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-xs font-medium transition-all active:scale-[0.99]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>End Room For Everyone</span>
                </button>
              </div>
            </>
          ) : (
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-center backdrop-blur-sm">
              <Shield className="w-6 h-6 text-brand-400 mx-auto mb-2 drop-shadow" />
              <p className="text-xs text-slate-200 font-semibold mb-1">
                {room.settings.allowGuestControl
                  ? 'Collaborative Playback Enabled'
                  : 'Host-Controlled Playback'}
              </p>
              <p className="text-[11px] text-surface-muted leading-relaxed">
                {room.settings.allowGuestControl
                  ? 'The host has allowed all guests to control playback.'
                  : 'Only the host has permission to play, pause, or seek.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-5 mt-5 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white glass-btn-secondary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
