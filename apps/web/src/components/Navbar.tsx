import React from 'react';
import { Film, Share2, Users, Settings, LogOut, RefreshCw, AlertTriangle, MessageSquare } from 'lucide-react';
import { RoomInfo, ParticipantInfo } from '@syncwatch/shared';
import { ConnectionStatus } from '../hooks/useSyncWatch.js';

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
    <header className="h-14 sm:h-16 px-3.5 sm:px-6 flex items-center justify-between z-30 shrink-0 border-b border-white/[0.07] bg-[#030408]/80 backdrop-blur-xl transition-all">
      {/* Left: Brand Logo & Room Name */}
      <div className="flex items-center gap-3 min-w-0">
        <a href="/" className="flex items-center gap-2.5 group shrink-0" title="Cineva Home">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/20 border border-white/20 group-hover:scale-105 group-hover:shadow-brand-500/40 transition-all">
            <Film className="w-4 h-4 text-white drop-shadow-sm" />
          </div>
          <span className="font-extrabold text-sm sm:text-base tracking-wider text-white hidden sm:inline">
            <span className="text-white">CINE</span>
            <span className="text-brand-400 font-light ml-0.5">VA</span>
          </span>
        </a>

        {room && (
          <div className="flex items-center gap-2.5 pl-3 border-l border-white/[0.08] min-w-0">
            <h1 className="font-semibold text-xs sm:text-sm text-slate-200 truncate max-w-[120px] sm:max-w-[220px] md:max-w-sm">
              {room.name || 'Private Screening'}
            </h1>
            {isHost && (
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/30 shadow-xs shrink-0 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shadow-[0_0_6px_rgba(99,102,241,0.8)]"></span>
                HOST
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center / Right controls */}
      {room && (
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Cinema Synchronization Beacon */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-md text-xs font-medium shadow-xs">
            {connectionStatus === 'connected' ? (
              isSyncing ? (
                <>
                  <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                  <span className="text-[11px] text-amber-300/90 font-medium">Syncing</span>
                </>
              ) : (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]"></span>
                  </span>
                  <span className="text-[11px] text-emerald-300/95 font-semibold font-mono tracking-tight">SYNCED</span>
                </>
              )
            ) : connectionStatus === 'reconnecting' ? (
              <>
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-[11px] text-amber-300 font-medium">Reconnecting</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span className="text-[11px] text-rose-300 font-medium">Disconnected</span>
              </>
            )}
          </div>

          {/* Share / Invite Button */}
          <button
            onClick={onOpenShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.16] text-xs font-medium text-slate-200 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs cursor-pointer"
            title="Invite Friends to Screening"
          >
            <Share2 className="w-3.5 h-3.5 text-brand-400" />
            <span className="hidden sm:inline">Invite</span>
          </button>

          {/* Chat Companion Toggle */}
          <button
            onClick={() => {
              if (onToggleSidebarTab) onToggleSidebarTab('chat');
              if (!isCompanionOpen && onToggleCompanion) onToggleCompanion();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs cursor-pointer ${isCompanionOpen && activeSidebarTab === 'chat'
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
              }`}
            title="Cinema Chat"
          >
            <MessageSquare className="w-3.5 h-3.5 text-brand-400" />
            <span className="hidden sm:inline text-[11px]">Chat</span>
          </button>

          {/* Audience Count Pill */}
          <button
            onClick={() => {
              if (onToggleSidebarTab) onToggleSidebarTab('participants');
              if (!isCompanionOpen && onToggleCompanion) onToggleCompanion();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs cursor-pointer ${isCompanionOpen && activeSidebarTab === 'participants'
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-slate-300'
              }`}
            title="Audience"
          >
            <Users className="w-3.5 h-3.5 text-brand-400" />
            <span className="font-mono text-[11px]">{onlineCount}</span>
          </button>

          {/* Room Settings */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.16] text-slate-300 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs cursor-pointer"
            title="Screening Settings"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          {/* Leave Room */}
          <button
            onClick={onLeaveRoom}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 text-slate-400 hover:text-rose-300 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs cursor-pointer"
            title="Exit Screening"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      )}
    </header>
  );
};

