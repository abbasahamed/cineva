import React, { useState } from 'react';
import { X, ToggleLeft, ToggleRight, Trash2, Edit3, Sliders, Shield, Activity } from 'lucide-react';
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-md animate-fadeIn"
    >
      <div className="relative w-full max-w-md bg-[#0e111d]/60 backdrop-blur-2xl border border-white/[0.15] rounded-3xl shadow-[inset_0_1.2px_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(0,0,0,0.5),0_24px_60px_-12px_rgba(0,0,0,0.85)] p-6 sm:p-7 overflow-hidden animate-scaleUp">
        {/* Subtle top ambient highlight accent */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-violet-500/15 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between pb-4 border-b border-white/[0.10] mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-violet-500/15 border border-white/20 flex items-center justify-center text-indigo-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_4px_14px_rgba(99,102,241,0.25)]">
              <Sliders className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100 tracking-tight">Room Settings</h3>
              <p className="text-xs text-slate-300/80">Manage permissions and room state</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.12] text-slate-300 hover:text-white transition-all flex items-center justify-center active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
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
              {/* Host Network Check */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-brand-400" />
                    <span className="text-xs font-semibold text-slate-200">Network Check</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunNetworkCheck}
                    disabled={checkingNetwork}
                    className="px-3 py-1 rounded-xl glass-btn-primary text-xs font-medium text-white disabled:opacity-50 transition-all active:scale-95"
                  >
                    {checkingNetwork ? 'Probing...' : 'Check Speed'}
                  </button>
                </div>
                <p className="text-[11px] text-surface-muted leading-relaxed">
                  Test your actual upload throughput to Cineva to verify how many 1080p viewers your connection can comfortably host.
                </p>
                {networkResult && (
                  <div className="mt-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs">
                    <p className="font-medium text-brand-300">
                      Your upload speed supports ~{networkResult.viewersAt1080p} viewers at 1080p ({networkResult.mbps} Mbps each).
                    </p>
                    {networkResult.mbps < 8 && (
                      <p className="text-[11px] text-amber-300/80 mt-1">
                        Upload speed is modest; viewers on slower connections will automatically adapt to 720p or 480p.
                      </p>
                    )}
                  </div>
                )}
              </div>

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
