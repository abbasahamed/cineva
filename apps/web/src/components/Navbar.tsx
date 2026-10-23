import React from 'react';
import { Film, Share2, Users, Settings, LogOut } from 'lucide-react';
import { RoomInfo, ParticipantInfo } from '@syncwatch/shared';
import { ConnectionStatus } from '../hooks/useSyncWatch.js';
import { ThemeSelector } from './ThemeSelector.js';

interface NavbarProps {
  room: RoomInfo | null;
  participants: ParticipantInfo[];
  connectionStatus: ConnectionStatus;
  isHost: boolean;
  isSyncing?: boolean;
  onOpenShare: () => void;
  onOpenSettings: () => void;
  onLeaveRoom: () => void;
  activeSidebarTab?: 'chat' | 'participants';
  onToggleSidebarTab?: (tab: 'chat' | 'participants') => void;
  isCompanionOpen?: boolean;
  onToggleCompanion?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  room,
  participants,
  connectionStatus,
  isHost,
  isSyncing = false,
  onOpenShare,
  onOpenSettings,
  onLeaveRoom,
  activeSidebarTab = 'chat',
  onToggleSidebarTab,
  isCompanionOpen = true,
  onToggleCompanion,
}) => {
  const onlineCount = participants.filter((p) => p.isOnline).length;

  return (
    <header className="h-14 sm:h-16 px-3 sm:px-6 flex items-center justify-between z-30 shrink-0 border-b border-white/[0.07] bg-black/90 backdrop-blur-xl">
      {/* Left: Brand Logo & Room Name */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <a href="/" className="flex items-center gap-2 group shrink-0" title="Cineva Home">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/20 border border-white/20 group-hover:scale-105 transition-transform">
            <Film className="w-4 h-4 text-white drop-shadow-sm" />
          </div>
          <span className="font-extrabold text-sm sm:text-base tracking-wider text-white hidden md:inline">
            <span className="text-white">CINE</span>
            <span className="text-brand-400 font-light ml-0.5">VA</span>
          </span>
        </a>

        {room && (
          <div className="flex items-center gap-2 pl-2.5 sm:pl-3 border-l border-white/[0.08] min-w-0">
            <h1 className="font-semibold text-sm text-slate-200 truncate max-w-[110px] sm:max-w-[200px] md:max-w-sm">
              {room.name || 'Screening'}
            </h1>
            {isHost && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/30 text-[9px] sm:text-[10px] font-bold tracking-wider shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                <span>HOST</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: Action buttons */}
      {room && (
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Theme Selector — desktop only */}
          <div className="hidden sm:block">
            <ThemeSelector />
          </div>

          {/* Invite */}
          <button
            onClick={onOpenShare}
            className="w-9 h-9 sm:w-auto sm:h-auto flex items-center justify-center sm:gap-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.16] text-xs font-medium text-slate-200 transition-all hover:scale-[1.02] active:scale-[0.97] cursor-pointer"
            title="Invite Friends"
          >
            <Share2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-brand-400" />
            <span className="hidden sm:inline">Invite</span>
          </button>

          {/* Audience count */}
          <button
            onClick={() => {
              if (onToggleSidebarTab) onToggleSidebarTab('participants');
              if (!isCompanionOpen && onToggleCompanion) onToggleCompanion();
            }}
            className={`flex items-center gap-1.5 px-2.5 h-9 sm:h-auto sm:py-1.5 rounded-xl border text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.97] cursor-pointer ${
              isCompanionOpen && activeSidebarTab === 'participants'
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
            }`}
            title="Audience"
          >
            <Users className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-brand-400" />
            <span className="font-mono text-[11px]">{onlineCount}</span>
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="w-9 h-9 sm:w-auto sm:h-auto flex items-center justify-center sm:p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.16] text-slate-300 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.97] cursor-pointer"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Leave */}
          <button
            onClick={onLeaveRoom}
            className="w-9 h-9 sm:w-auto sm:h-auto flex items-center justify-center sm:p-2 rounded-xl bg-white/[0.04] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 text-slate-400 hover:text-rose-300 transition-all hover:scale-[1.02] active:scale-[0.97] cursor-pointer"
            title="Exit Screening"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
};
