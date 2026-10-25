import React, { useState, useRef } from 'react';
import { X, UploadCloud, Film, CheckCircle2, AlertCircle, Tv } from 'lucide-react';
import { uploadMedia } from '../services/api.js';
import { useToast } from './Toast.js';

interface MediaUploadModalProps {
  roomId: string;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (media: { id: string; title: string; filename: string; url: string }) => void;
}

export const MediaUploadModal: React.FC<MediaUploadModalProps> = ({
  roomId,
  sessionId,
  isOpen,
  onClose,
  onUploadComplete,
}) => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressDetails, setProgressDetails] = useState<{ uploadedBytes: number; totalBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  const handleFileSelection = (selectedFile: File) => {
    setError(null);
    const validExtensions = ['.mp4', '.webm', '.mkv', '.mov', '.ogg', '.ogv'];
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();

    const isVideoExtension = validExtensions.includes(ext);
    const isVideoMime =
      selectedFile.type.startsWith('video/') ||
      selectedFile.type === 'application/x-matroska' ||
      selectedFile.type === 'application/mkv' ||
      selectedFile.type === 'application/octet-stream' ||
      selectedFile.type === '';

    if (!isVideoExtension && !isVideoMime) {
      setError('Please select a valid video format (MP4, WebM, MKV, MOV, OGG).');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024 * 1024) {
      setError('File size exceeds the 5GB upload limit.');
      return;
    }

    setFile(selectedFile);
    if (!customTitle) {
      const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setCustomTitle(cleanName);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setIsUploading(true);
      setError(null);
      setProgress(0);

      const result = await uploadMedia(roomId, sessionId, file, customTitle, (pct, info) => {
        setProgress(pct);
        if (info) {
          setProgressDetails({ uploadedBytes: info.uploadedBytes, totalBytes: info.totalBytes });
        }
      });

      showToast('Video added to watch room', 'success');
      onUploadComplete(result);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-md animate-fadeIn"
    >
      <div className="relative w-full max-w-md bg-[#0e111d]/60 backdrop-blur-2xl border border-white/[0.15] rounded-3xl shadow-[inset_0_1.2px_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(0,0,0,0.5),0_24px_60px_-12px_rgba(0,0,0,0.85)] p-6 sm:p-7 overflow-hidden animate-scaleUp">
        {/* Ambient luminous glow spots under the 60% glass */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none" />
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-violet-500/15 blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between pb-4 border-b border-white/[0.10] mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-violet-500/15 border border-white/20 flex items-center justify-center text-indigo-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_4px_14px_rgba(99,102,241,0.25)]">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100 tracking-tight">Add Video</h3>
              <p className="text-xs text-slate-300/80">Upload an authorized video for this room</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            aria-label="Close modal"
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.12] text-slate-300 hover:text-white transition-all flex items-center justify-center active:scale-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="relative mb-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between gap-2.5 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            {file && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-rose-500/25 hover:bg-rose-500/35 text-rose-100 border border-rose-500/40 transition-colors shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Drag & Drop Area */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-7 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-indigo-400 bg-indigo-500/20 backdrop-blur-lg shadow-[0_0_24px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.25)] scale-[1.01]'
              : file
              ? 'border-emerald-500/40 bg-emerald-500/10 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
              : 'border-white/[0.16] hover:border-white/[0.32] bg-white/[0.035] hover:bg-white/[0.07] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mkv,.mp4,.webm,.mov,.ogv,.ogg"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelection(e.target.files[0]);
              }
            }}
          />

          {file ? (
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2.5 border border-emerald-500/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_4px_14px_rgba(16,185,129,0.25)]">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <span className="text-xs font-semibold text-white mb-0.5 truncate max-w-xs">{file.name}</span>
              <span className="text-[10px] text-slate-300 font-mono">
                {file.size >= 1024 * 1024 * 1024
                  ? `${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB`
                  : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
              </span>
              <span className="text-[10px] text-indigo-300 hover:text-indigo-200 mt-2 font-medium">Click to choose another file</span>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="w-13 h-13 rounded-2xl bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 flex items-center justify-center mb-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_4px_16px_rgba(99,102,241,0.25)]">
                <UploadCloud className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-slate-100 mb-1 tracking-tight">
                Drag & drop video here, or browse
              </span>
              <span className="text-[11px] text-slate-300/75">MP4, WebM, MKV, MOV • up to 5 GB</span>
            </div>
          )}
        </div>

        {/* MKV Compatibility Notice */}
        {file && file.name.toLowerCase().endsWith('.mkv') && (
          <div className="relative mt-3 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[11px] leading-relaxed flex items-start gap-2.5 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              <strong className="font-semibold text-amber-100">MKV format supported for upload.</strong> Native browser playback of MKV depends on your browser's supported codecs. MP4 or WebM is recommended for universal playback across all devices.
            </span>
          </div>
        )}

        {/* Video Title Input */}
        {file && (
          <div className="relative mt-4">
            <label className="block text-xs font-medium text-slate-200 mb-1.5">Display title</label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="e.g. My Movie Title"
              className="w-full px-4 py-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/[0.14] text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] transition-all"
            />
          </div>
        )}

        {/* Progress bar */}
        {isUploading && (
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-xs font-mono text-slate-200 mb-1.5">
              <span>Uploading video...</span>
              <span>
                {progressDetails
                  ? `${formatBytes(progressDetails.uploadedBytes)} / ${formatBytes(progressDetails.totalBytes)} (${progress}%)`
                  : `${progress}%`}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden border border-white/[0.12] p-0.5">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-violet-400 rounded-full transition-all duration-150 shadow-[0_0_12px_rgba(99,102,241,0.7)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="relative mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-white/[0.10]">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(0,0,0,0.25)] transition-all active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className={`px-6 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
              !file || isUploading
                ? 'text-slate-400/70 bg-white/[0.04] border border-white/[0.08] cursor-not-allowed'
                : 'text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 border border-white/25 shadow-[0_4px_18px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]'
            }`}
          >
            {isUploading ? 'Uploading...' : 'Save Video'}
          </button>
        </div>
      </div>
    </div>
  );
};
