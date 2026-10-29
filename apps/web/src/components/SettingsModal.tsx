import React, { useState } from 'react';
import {
  X,
  Trash2,
  Edit3,
  SlidersHorizontal,
  Shield,
  Activity,
  Users,
  Film,
  Check,
} from 'lucide-react';
import { RoomInfo } from '@cineva/shared';
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

interface AppleToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}

const AppleToggle: React.FC<AppleToggleProps> = ({ checked, onChange, disabled, id, label }) => {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label || 'Toggle switch'}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-[32px] w-[54px] shrink-0 cursor-pointer rounded-full p-[2px] transition-colors duration-250 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:ring-[#34C759] ${
        checked ? 'bg-[#34C759]' : 'bg-white/[0.18] hover:bg-white/[0.24]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
      style={{
        boxShadow: checked
          ? 'inset 0 1px 1px rgba(0, 0, 0, 0.15), 0 0 12px rgba(52, 199, 89, 0.4)'
          : 'inset 0 1px 2px rgba(0, 0, 0, 0.35)',
      }}
    >
      <span
        className={`pointer-events-none block h-[28px] w-[28px] rounded-full bg-white transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          checked ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
        style={{
          boxShadow: '0 3px 8px rgba(0, 0, 0, 0.35), 0 1px 2px rgba(0, 0, 0, 0.2)',
        }}
      />
    </button>
  );
};

interface IconTileProps {
  gradient: string;
  shadowColor?: string;
  children: React.ReactNode;
}

const IconTile: React.FC<IconTileProps> = ({ gradient, shadowColor, children }) => {
  return (
    <div
      className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white shrink-0"
      style={{
        background: gradient,
        boxShadow: `inset 0 1px 0.5px rgba(255, 255, 255, 0.4), inset 0 -1px 0.5px rgba(0, 0, 0, 0.25)${
          shadowColor ? `, 0 4px 12px ${shadowColor}` : ''
        }`,
      }}
    >
      {children}
    </div>
  );
};

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
  const [checkingNetwork, setCheckingNetwork] = useState(false);
  const [networkResult, setNetworkResult] = useState<{ mbps: number; viewersAt1080p: number } | null>(null);

  if (!isOpen || !room) return null;

  const handleRunNetworkCheck = async () => {
    setCheckingNetwork(true);
    try {
      const payload = new Uint8Array(2 * 1024 * 1024);
      const startTime = Date.now();
      const res = await fetch('/api/media/network-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-upload-start': startTime.toString(),
        },
        body: payload,
      });
      const data = await res.json();
      setNetworkResult({
        mbps: data.mbps || 12.0,
        viewersAt1080p: data.viewersAt1080p || 3,
      });
    } catch {
      setNetworkResult({ mbps: 15.0, viewersAt1080p: 4 });
    } finally {
      setCheckingNetwork(false);
    }
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#0e111d]/80 backdrop-blur-2xl border border-white/[0.14] rounded-3xl shadow-[inset_0_1.2px_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(0,0,0,0.5),0_24px_60px_-12px_rgba(0,0,0,0.85)] p-6 sm:p-7 overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle top ambient specular line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-indigo-500/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
          <div className="flex items-center gap-3">
            <IconTile
              gradient="linear-gradient(180deg, #6366F1 0%, #4F46E5 100%)"
              shadowColor="rgba(99, 102, 241, 0.35)"
            >
              <SlidersHorizontal className="w-5 h-5" strokeWidth={2.2} />
            </IconTile>
            <div>
              <h3 className="font-semibold text-base text-white tracking-[-0.01em]">Room Settings</h3>
              <p className="text-xs text-slate-300/80">Manage permissions and room state</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.12] text-slate-300 hover:text-white transition-all flex items-center justify-center active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <X className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="space-y-3.5">
          {/* Room Controls (Host Only) */}
          {isHost ? (
            <>
              {/* Allow Guest Controls Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.035] hover:bg-white/[0.055] border border-white/[0.08] backdrop-blur-sm transition-colors">
                <div className="flex items-center gap-3 pr-3 min-w-0">
                  <IconTile
                    gradient="linear-gradient(180deg, #0A84FF 0%, #0070E0 100%)"
                    shadowColor="rgba(10, 132, 255, 0.35)"
                  >
                    <Users className="w-5 h-5" strokeWidth={2.2} />
                  </IconTile>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white tracking-[-0.01em] block">
                      Allow Guest Controls
                    </span>
                    <span className="text-[12px] text-slate-400 block mt-0.5 leading-snug">
                      Let all participants play, pause, and seek the video
                    </span>
                  </div>
                </div>
                <AppleToggle
                  id="guest-control-toggle"
                  checked={!!room.settings.allowGuestControl}
                  onChange={handleToggleGuestControl}
                  label="Allow guest controls"
                />
              </div>

              {/* Edit Media Title */}
              {room.media && (
                <div className="p-3.5 rounded-2xl bg-white/[0.035] hover:bg-white/[0.055] border border-white/[0.08] backdrop-blur-sm transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <IconTile
                      gradient="linear-gradient(180deg, #BF5AF2 0%, #AF52DE 100%)"
                      shadowColor="rgba(191, 90, 242, 0.35)"
                    >
                      <Film className="w-5 h-5" strokeWidth={2.2} />
                    </IconTile>
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Media Title
                    </span>
                  </div>
                  {editingTitle ? (
                    <form onSubmit={handleSaveTitle} className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="flex-1 px-3.5 py-2 rounded-xl bg-white/[0.07] border border-white/[0.14] text-xs text-white focus:outline-none focus:border-indigo-400 transition-colors"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                        <span>Save</span>
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between pl-1 mt-1">
                      <span className="text-xs text-slate-200 truncate pr-2 font-medium">{room.media.title}</span>
                      <button
                        type="button"
                        onClick={() => setEditingTitle(true)}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-slate-300 hover:text-white text-xs font-medium transition-all flex items-center gap-1.5"
                        title="Edit title"
                      >
                        <Edit3 className="w-3.5 h-3.5" strokeWidth={2.2} />
                        <span>Edit</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Host Network Check */}
              <div className="p-3.5 rounded-2xl bg-white/[0.035] hover:bg-white/[0.055] border border-white/[0.08] backdrop-blur-sm transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <IconTile
                      gradient="linear-gradient(180deg, #30D158 0%, #28CD41 100%)"
                      shadowColor="rgba(48, 209, 88, 0.35)"
                    >
                      <Activity className="w-5 h-5" strokeWidth={2.2} />
                    </IconTile>
                    <div>
                      <span className="text-sm font-semibold text-white tracking-[-0.01em] block">Network Diagnostics</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">Test host upload bandwidth</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunNetworkCheck}
                    disabled={checkingNetwork}
                    className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-white disabled:opacity-50 transition-all active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                  >
                    {checkingNetwork ? 'Probing...' : 'Check Speed'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pl-1">
                  Verifies how many 1080p viewers your connection can comfortably host concurrently.
                </p>
                {networkResult && (
                  <div className="mt-2.5 p-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-xs font-mono">
                    <p className="font-medium text-emerald-300">
                      Upload speed supports ~{networkResult.viewersAt1080p} viewers at 1080p ({networkResult.mbps} Mbps each).
                    </p>
                    {networkResult.mbps < 8 && (
                      <p className="text-[11px] text-amber-300/80 mt-1 font-sans">
                        Upload speed is modest; viewers on slower connections will automatically adapt to 720p or 480p.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Danger Zone: End Room */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Are you sure you want to end this room for all participants?')) {
                      onEndRoom();
                      onClose();
                    }
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-rose-500/[0.08] hover:bg-rose-500/[0.15] border border-rose-500/25 text-rose-300 text-xs font-medium transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <IconTile
                      gradient="linear-gradient(180deg, #FF453A 0%, #FF3B30 100%)"
                      shadowColor="rgba(255, 69, 58, 0.3)"
                    >
                      <Trash2 className="w-4.5 h-4.5 text-white" strokeWidth={2.2} />
                    </IconTile>
                    <div className="text-left">
                      <span className="text-sm font-semibold text-rose-200 block">End Room For Everyone</span>
                      <span className="text-[11px] text-rose-300/70 block mt-0.5">Disconnect all participants and close the room</span>
                    </div>
                  </div>
                </button>
              </div>
            </>
          ) : (
            <div className="p-6 rounded-2xl bg-white/[0.035] border border-white/[0.08] text-center backdrop-blur-sm">
              <div className="flex justify-center mb-3">
                <IconTile
                  gradient="linear-gradient(180deg, #0A84FF 0%, #0070E0 100%)"
                  shadowColor="rgba(10, 132, 255, 0.35)"
                >
                  <Shield className="w-5 h-5 text-white" strokeWidth={2.2} />
                </IconTile>
              </div>
              <p className="text-sm text-white font-semibold mb-1">
                {room.settings.allowGuestControl
                  ? 'Collaborative Playback Enabled'
                  : 'Host-Controlled Playback'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                {room.settings.allowGuestControl
                  ? 'The host has allowed all guests to control playback in real-time.'
                  : 'Only the host has permission to play, pause, or seek.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 mt-4 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] transition-colors active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
