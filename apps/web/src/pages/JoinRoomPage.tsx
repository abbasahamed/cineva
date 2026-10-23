import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, LogIn, Tv } from 'lucide-react';
import { joinRoom, getRoomDetails } from '../services/api.js';
import { RoomInfo } from '@cineva/shared';
import { CinematicBackground } from '../components/CinematicBackground.js';

export const JoinRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const { roomCode: paramCode } = useParams<{ roomCode?: string }>();

  const [roomCode, setRoomCode] = useState(paramCode ? paramCode.toUpperCase() : '');
  const [displayName, setDisplayName] = useState('');
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch room details if code is provided in route
  useEffect(() => {
    if (paramCode) {
      getRoomDetails(paramCode)
        .then((info) => {
          setRoomInfo(info);
          setError(null);
        })
        .catch((err) => {
          setError(err.message === 'Room not found' ? "That room doesn't exist." : err.message);
        });
    }
  }, [paramCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const code = roomCode.trim().toUpperCase();
    const name = displayName.trim();

    if (!code) {
      setError('Please enter a room code.');
      return;
    }
    if (!name) {
      setError('Please enter your display name.');
      return;
    }

    try {
      setIsSubmitting(true);
      const existingSession = sessionStorage.getItem(`cineva_session_${code}`) || undefined;

      const result = await joinRoom(code, name, existingSession);

      sessionStorage.setItem(`cineva_session_${code}`, result.sessionId);
      sessionStorage.setItem(`sw_name_${code}`, name);

      navigate(`/room/${code}`);
    } catch (err: any) {
      const msg = err.message || 'Failed to join room.';
      setError(
        msg.includes('Room not found')
          ? "That room doesn't exist. Please check the code."
          : msg.includes('ended')
          ? 'This watch room has ended.'
          : msg.includes('expired')
          ? 'This watch room has expired.'
          : msg
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-slate-100 flex flex-col justify-center items-center p-5 sm:p-8 selection:bg-indigo-600 selection:text-white relative overflow-x-hidden">
      {/* Blurred Gaussian Ambient Atmosphere from Home Identity */}
      <CinematicBackground variant="blurred" />

      <div className="w-full max-w-md relative z-10 page-enter my-6">
        {/* Back Link */}
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white mb-6 px-3.5 py-1.5 rounded-xl glass-btn-secondary border border-white/10 hover:border-white/20 transition-all active:scale-95 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 text-brand-300" />
          <span>Back to Home</span>
        </button>

        {/* Ambient Glow behind Panel */}
        <div
          className="absolute -inset-2 rounded-3xl bg-brand-500/[0.12] blur-2xl -z-10 pointer-events-none"
          aria-hidden="true"
        />

        {/* Liquid Glass Card */}
        <div className="glass-card rounded-3xl p-6 sm:p-9 shadow-glass-elevated border border-white/[0.12] bg-[#0a0c16]/85 backdrop-blur-2xl relative overflow-hidden glass-reflection">
          {/* Subtle top ambient highlight accent */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-400/35 to-transparent pointer-events-none" />

          {/* Header */}
          <div className="mb-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-medium mb-3 shadow-xs">
              <LogIn className="w-3.5 h-3.5" />
              <span>Join Watch Party</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1.5 tracking-tight">
              Join a watch room
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {roomInfo ? (
                <span className="text-brand-300 font-medium flex items-center gap-1.5 mt-1">
                  <Tv className="w-3.5 h-3.5" /> Ready to join "{roomInfo.name}"
                </span>
              ) : (
                'Enter the room code to sync up with your friends.'
              )}
            </p>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2.5 backdrop-blur-xs animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Room Code */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Room code
              </label>
              <input
                type="text"
                maxLength={10}
                required
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. A7K9PX"
                className="w-full px-4 py-3.5 rounded-2xl glass-input text-base font-mono font-bold uppercase tracking-widest text-brand-300 placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all text-center sm:text-left"
              />
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Your name
              </label>
              <input
                type="text"
                maxLength={30}
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full px-4 py-3 rounded-2xl glass-input text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-2xl glass-btn-primary hover:shadow-[0_0_24px_rgba(99,102,241,0.4)] text-white font-semibold text-sm shadow-xl transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Connecting...' : 'Join Room'}
              </button>
            </div>
          </form>

          {/* Secondary Action */}
          <div className="mt-7 pt-5 border-t border-white/[0.08] text-center">
            <button
              onClick={() => navigate('/create')}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Want to host instead? <span className="text-brand-400 hover:text-brand-300 font-medium">Create your own room →</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

