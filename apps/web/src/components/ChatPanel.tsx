import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { ChatMessage } from '@syncwatch/shared';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentParticipantId?: string;
  onSendMessage: (text: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentParticipantId,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0c16]/75 backdrop-blur-2xl border border-white/[0.1] rounded-3xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="text-sm">💬</span>
          <span className="font-semibold text-[11px] tracking-wider uppercase text-slate-200">
            Cinema Chat
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
          {messages.length} msgs
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-surface-muted">
            <p className="text-xs font-semibold text-slate-200">No messages yet</p>
            <p className="text-[11px] text-surface-muted mt-1 leading-relaxed">
              Start the conversation while the movie rolls.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-1.5">
                  <span className="text-[10px] text-surface-muted bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-white/[0.06] backdrop-blur-xs">
                    {msg.message}
                  </span>
                </div>
              );
            }

            const isMe = msg.participantId === currentParticipantId;
            const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const initial = (msg.displayName || 'U').charAt(0).toUpperCase();

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'} animate-fadeIn`}
              >
                {/* Avatar */}
                <div className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.12] flex items-center justify-center font-bold text-[10px] text-brand-300 shrink-0 mt-0.5 shadow-xs">
                  {initial}
                </div>

                {/* Content */}
                <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] font-medium text-slate-400">
                      {isMe ? 'You' : msg.displayName}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">{timeStr}</span>
                  </div>

                  <div
                    className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words shadow-sm ${
                      isMe
                        ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white rounded-tr-xs border border-white/20 shadow-brand-600/20'
                        : 'bg-white/[0.05] text-slate-200 border border-white/[0.08] backdrop-blur-sm rounded-tl-xs'
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Footer with Shift+Enter handling */}
      <div className="p-2.5 border-t border-white/[0.07] bg-white/[0.02] backdrop-blur-md flex items-end gap-2">
        <textarea
          rows={1}
          value={inputText}
          maxLength={500}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          className="flex-1 glass-input text-xs text-slate-100 placeholder-slate-500 px-3.5 py-2.5 rounded-xl border border-white/[0.08] focus:outline-none focus:border-brand-500/60 transition-colors resize-none max-h-24 overflow-y-auto"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="p-2.5 rounded-xl glass-btn-primary disabled:opacity-30 text-white transition-all shadow-sm shrink-0 active:scale-95"
          title="Send (Enter)"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
