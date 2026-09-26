import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Film,
  ArrowLeft,
  UploadCloud,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Tv,
} from 'lucide-react';
import { createRoom, createDemoRoom, uploadMedia } from '../services/api.js';
import { CinematicBackground } from '../components/CinematicBackground.js';

export const CreateRoomPage: React.FC = () => {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [useDemoMedia, setUseDemoMedia] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File) => {
    setError(null);
    const validExtensions = ['.mp4', '.webm', '.mkv', '.mov', '.ogg', '.ogv'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    const isVideoExtension = validExtensions.includes(ext);
    const isVideoMime =
      file.type.startsWith('video/') ||
      file.type === 'application/x-matroska' ||
      file.type === 'application/mkv' ||
      file.type === 'application/octet-stream' ||
      file.type === '';

    if (!isVideoExtension && !isVideoMime) {
      setError('Please select a valid video format (MP4, WebM, MKV, MOV, OGG).');
      return;
    }

    if (file.size > 5 * 1024 * 1024 * 1024) {
      setError('Video file exceeds the 5GB upload limit.');
      return;
    }

    setSelectedFile(file);
    setUseDemoMedia(false);
    if (!roomName.trim()) {
      const clean = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setRoomName(clean);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = displayName.trim();
    const rName = roomName.trim() || 'Watch Room';

    if (!name) {
      setError('Please enter your display name.');
      return;
    }

    try {
      setIsSubmitting(true);

      // If user opted for demo media and didn't select custom file:
      if (useDemoMedia && !selectedFile) {
        const demoResult = await createDemoRoom(name);
        sessionStorage.setItem(`sw_session_${demoResult.room.roomCode}`, demoResult.hostSessionId);
        sessionStorage.setItem(`sw_name_${demoResult.room.roomCode}`, name);
        navigate(`/room/${demoResult.room.roomCode}`);
        return;
      }

      // 1. Create Room
      const result = await createRoom({
        displayName: name,
        roomName: rName,
        allowGuestControl: false,
      });

      // Save Host identity in session
      sessionStorage.setItem(`sw_session_${result.room.roomCode}`, result.hostSessionId);
      sessionStorage.setItem(`sw_name_${result.room.roomCode}`, name);

      // 2. Upload file if selected
      if (selectedFile) {
        setUploadProgress(0);
        await uploadMedia(
          result.room.id,
          result.hostSessionId,
          selectedFile,
          selectedFile.name.replace(/\.[^/.]+$/, ''),
          (pct) => setUploadProgress(pct)
        );
      }

      navigate(`/room/${result.room.roomCode}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room.');
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#05060a] text-slate-100 flex flex-col justify-center items-center p-5 sm:p-8 selection:bg-indigo-600 selection:text-white relative overflow-x-hidden">
      {/* Blurred Gaussian Ambient Atmosphere from Home Identity */}
      <CinematicBackground variant="blurred" />

      <div className="w-full max-w-lg relative z-10 page-enter my-6">
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

        {/* Floating Glass Workspace */}
        <div className="glass-card border border-white/[0.12] rounded-3xl p-6 sm:p-9 shadow-glass-elevated glass-reflection bg-[#0a0c16]/85 backdrop-blur-2xl relative overflow-hidden">
          {/* Subtle top ambient highlight accent */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-400/35 to-transparent pointer-events-none" />

          {/* Header */}
          <div className="mb-7">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1.5 tracking-tight">
              Create your watch room
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Set up your room, drop an authorized video, and invite your friends.
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2.5 backdrop-blur-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Display Name */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Your display name
              </label>
              <input
                type="text"
                maxLength={30}
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full px-4 py-3 rounded-2xl glass-input text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Room Name */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Room title (optional)
              </label>
              <input
                type="text"
                maxLength={60}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Friday Movie Night"
                className="w-full px-4 py-3 rounded-2xl glass-input text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
            </div>

            {/* Video Selection / Dropzone */}
            <div className="pt-1">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Video source
              </label>

              {!selectedFile && !useDemoMedia ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all duration-200 ${
                    isDragging
                      ? 'border-brand-400 bg-brand-500/15 shadow-glass-glow scale-[1.01]'
                      : 'border-white/[0.12] hover:border-white/[0.24] bg-white/[0.03] hover:bg-white/[0.05]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,.mkv,.mp4,.webm,.mov,.ogv,.ogg"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFileChange(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-brand-400 mx-auto mb-3 shadow-glass-sm">
                    <UploadCloud className="w-6 h-6 drop-shadow" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200 mb-1">
                    Drag & drop your video here
                  </p>
                  <p className="text-[11px] text-surface-muted mb-4">
                    MP4, WebM, MKV, MOV • up to 5 GB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUseDemoMedia(true);
                      if (!roomName.trim()) setRoomName('🎬 Sample Watch Room');
                    }}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand-300 hover:text-brand-200 bg-brand-500/10 px-3 py-1.5 rounded-xl border border-brand-500/20 shadow-xs"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>Or use sample HD demo video</span>
                  </button>
                </div>
              ) : selectedFile ? (
                /* Selected File Card */
                <div className="space-y-2">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30 shadow-xs">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-[10px] font-mono text-surface-muted">
                          {selectedFile.size >= 1024 * 1024 * 1024
                            ? `${(selectedFile.size / (1024 * 1024 * 1024)).toFixed(2)} GB`
                            : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedFile.name.toLowerCase().endsWith('.mkv') && (
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] leading-relaxed flex items-start gap-2.5 backdrop-blur-xs">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                      <span>
                        <strong className="font-semibold text-amber-200">MKV format supported for upload (up to 5 GB).</strong> Native browser playback of MKV depends on your browser's supported codecs. MP4 or WebM is recommended for universal compatibility across all devices.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* Selected Demo Media Card */
                <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 border border-brand-500/30 shadow-xs">
                      <Tv className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        Big Buck Bunny (Sample HD Video)
                      </p>
                      <p className="text-[10px] font-mono text-surface-muted">
                        Built-in test video (180s 720p)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseDemoMedia(false)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Upload progress state */}
            {uploadProgress !== null && (
              <div className="pt-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1.5">
                  <span>Uploading video to room...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden border border-white/[0.08] p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 to-indigo-400 rounded-full transition-all duration-150 shadow-[0_0_10px_rgba(99,102,241,0.6)]"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Submit CTA */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-2xl glass-btn-primary hover:shadow-[0_0_24px_rgba(99,102,241,0.4)] text-white font-semibold text-sm shadow-xl transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting
                  ? uploadProgress !== null
                    ? `Uploading (${uploadProgress}%)...`
                    : 'Creating room...'
                  : 'Create Room'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
