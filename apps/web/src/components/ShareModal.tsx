import React, { useState } from 'react';
import { X, Copy, Check, Share2, Link2, Users } from 'lucide-react';
import { useToast } from './Toast.js';

interface ShareModalProps {
  isOpen: boolean;
  roomCode: string;
  roomName: string;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  roomCode,
  roomName,
  onClose,
}) => {
  const { showToast } = useToast();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/join/${roomCode}`;
  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    showToast('Share link copied to clipboard', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    showToast('Room code copied to clipboard', 'success');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleNativeShare = async () => {
    if (hasNativeShare) {
      try {
        await navigator.share({
          title: `Join "${roomName}" on Cineva`,
          text: `Watch together in real time on Cineva! Room code: ${roomCode}`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed
      }
    }
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
              <Share2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100 tracking-tight">Invite Friends</h3>
              <p className="text-xs text-surface-muted">Share room link or 6-character code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Share Link Row */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Direct Invite Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-slate-200 select-all focus:outline-none"
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl glass-btn-primary text-white text-xs font-medium transition-all shadow-sm active:scale-95"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Room Code Row */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Room Code
            </label>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm">
              <span className="font-mono font-bold text-lg text-brand-300 tracking-wider">
                {roomCode}
              </span>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-slate-200 text-xs font-medium transition-all active:scale-95"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          {hasNativeShare && (
            <button
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl glass-btn-secondary text-slate-200 text-xs font-medium transition-all active:scale-98"
            >
              <Share2 className="w-3.5 h-3.5 text-brand-400" />
              <span>Share via Apps...</span>
            </button>
          )}

          <p className="text-[11px] text-surface-muted text-center leading-relaxed">
            Anyone with this link or room code can join your private watch party without creating an account.
          </p>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-3 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white glass-btn-secondary transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
