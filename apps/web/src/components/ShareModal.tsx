import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Share2, Link2, Users } from 'lucide-react';
import { useToast } from './Toast.js';
import {
  getRoomInviteUrl,
  shareOnWhatsApp,
  copyToClipboard,
  isPrivateAddress,
} from '../utils/inviteUtils.js';

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
  const [shareUrl, setShareUrl] = useState<string>('');

  useEffect(() => {
    if (isOpen && roomCode) {
      getRoomInviteUrl(roomCode)
        .then((url) => {
          if (url && !isPrivateAddress(url)) {
            setShareUrl(url);
          }
        })
        .catch((err) => {
          console.debug('Public invite URL not yet discovered in ShareModal:', err?.message);
        });
    }
  }, [isOpen, roomCode]);

  if (!isOpen) return null;

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleCopyLink = async () => {
    try {
      const url = await getRoomInviteUrl(roomCode, {
        forceRefresh: !shareUrl || isPrivateAddress(shareUrl),
      });
      const ok = await copyToClipboard(url);
      if (ok) {
        setShareUrl(url);
        setCopiedLink(true);
        showToast('Share link copied to clipboard', 'success');
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        showToast('Failed to copy share link', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Public invite link unavailable: active public tunnel or deployed domain required.', 'error');
    }
  };

  const handleCopyCode = async () => {
    const ok = await copyToClipboard(roomCode);
    if (ok) {
      setCopiedCode(true);
      showToast('Room code copied to clipboard', 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      showToast('Failed to copy room code', 'error');
    }
  };

  const handleWhatsAppShare = async () => {
    try {
      const url = await getRoomInviteUrl(roomCode, {
        forceRefresh: !shareUrl || isPrivateAddress(shareUrl),
      });
      setShareUrl(url);
      const win = shareOnWhatsApp(url);
      if (!win) {
        showToast('Popup blocked: please allow popups to open WhatsApp.', 'error');
      } else {
        showToast('Opening WhatsApp...', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Public invite link unavailable: active public tunnel or deployed domain required.', 'error');
    }
  };

  const handleNativeShare = async () => {
    if (hasNativeShare) {
      try {
        const url = await getRoomInviteUrl(roomCode, {
          forceRefresh: !shareUrl || isPrivateAddress(shareUrl),
        });
        setShareUrl(url);
        await navigator.share({
          title: `Join "${roomName}" on Cineva`,
          text: `Watch together in real time on Cineva! Room code: ${roomCode}`,
          url,
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
      <div className="relative w-full max-w-md bg-[#0a0c16]/90 backdrop-blur-2xl border border-white/[0.12] rounded-3xl shadow-glass-elevated p-6 sm:p-7 overflow-hidden glass-reflection animate-scaleUp">
        {/* Subtle top ambient highlight accent */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-400/35 to-transparent pointer-events-none" />

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

          {/* WhatsApp Share Button */}
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-98 shadow-sm"
            style={{
              background: '#25D366',
              color: '#072412',
            }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84-1.56 1.56-3.64 2.41-5.84 2.41-1.49 0-2.95-.39-4.23-1.15l-.3-.18-3.13.82.83-3.05-.2-.31a8.196 8.196 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.03-1.25-.75-.67-1.26-1.5-1.41-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.42 1.44.54.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29z" />
            </svg>
            <span>Share on WhatsApp</span>
          </button>

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
