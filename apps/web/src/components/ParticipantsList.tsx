import React, { useState } from 'react';
import { Crown, MoreVertical, UserX, Shield } from 'lucide-react';
import { ParticipantInfo } from '@syncwatch/shared';
import { useToast } from './Toast.js';

interface ParticipantsListProps {
  participants: ParticipantInfo[];
  currentSessionId: string;
  isHost: boolean;
  onKickParticipant: (participantId: string) => void;
}

export const ParticipantsList: React.FC<ParticipantsListProps> = ({
  participants,
  currentSessionId,
  isHost,
  onKickParticipant,
}) => {
  const { showToast } = useToast();
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const handleKick = (p: ParticipantInfo) => {
    setActiveMenuId(null);
    onKickParticipant(p.id);
    showToast(`Removed ${p.displayName} from the room`, 'info');
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0c16]/75 backdrop-blur-2xl border border-white/[0.1] rounded-3xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span className="font-semibold text-[11px] tracking-wider uppercase text-slate-200">
            Audience
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
          {participants.length} watching
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {participants.map((p) => {
          const isMe = p.sessionId === currentSessionId;
          const initial = (p.displayName || 'U').charAt(0).toUpperCase();

          return (
            <div
              key={p.id}
              className="relative flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/[0.04] border border-transparent hover:border-white/[0.05] transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar with status dot */}
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.12] flex items-center justify-center font-bold text-xs text-brand-300 shadow-sm">
                    {initial}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-deep shadow-xs ${
                      p.isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-slate-600'
                    }`}
                  />
                </div>

                {/* Name & Badges */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {p.displayName}
                    </span>
                    {isMe && (
                      <span className="text-[10px] text-brand-400 font-medium">(You)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {p.isHost ? (
                      <span className="text-[9px] uppercase font-bold tracking-wider text-brand-300 flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-brand-500/15 border border-brand-500/25 w-max">
                        <Crown className="w-2.5 h-2.5 fill-brand-400 text-brand-400" />
                        Host
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                        <span className="w-1 h-1 rounded-full bg-emerald-400/80"></span>
                        Watching
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Host Contextual Moderation Action */}
              {isHost && !p.isHost && (
                <div className="relative">
                  <button
                    onClick={() => setActiveMenuId(activeMenuId === p.id ? null : p.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="User actions"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {activeMenuId === p.id && (
                    <div className="absolute right-0 top-7 z-30 py-1 bg-surface-card/90 backdrop-blur-xl border border-white/[0.12] rounded-xl shadow-glass-elevated min-w-[125px] animate-scaleUp">
                      <button
                        onClick={() => handleKick(p)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/15 transition-colors"
                      >
                        <UserX className="w-3.5 h-3.5 text-rose-400" />
                        <span>Remove user</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
