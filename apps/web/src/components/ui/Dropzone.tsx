import React, { useRef, useState } from 'react';

export interface DropzoneProps {
  onFileSelected: (file: File) => void;
  onUseSample?: () => void;
  disabled?: boolean;
  className?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFileSelected,
  onUseSample,
  disabled = false,
  className = '',
}) => {
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('#sample')) return;
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    if (disabled) return;
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      onFileSelected(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      onFileSelected(files[0]);
    }
  };

  return (
    <div
      className={`cineva-drop ${isOver ? 'over' : ''} ${className}`.trim()}
      tabIndex={disabled ? -1 : 0}
      aria-label="Drop a video here, or browse"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="ico">
        <svg viewBox="0 0 24 24">
          <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 15v2.5A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5V15" />
        </svg>
      </div>
      <strong>Drop a video here, or browse</strong>
      <span>MKV, MP4, WebM, MOV</span>
      {onUseSample && (
        <button
          type="button"
          id="sample"
          onClick={(e) => {
            e.stopPropagation();
            onUseSample();
          }}
        >
          Use the sample video instead
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/*,.mkv"
        hidden
        onChange={handleInputChange}
      />
    </div>
  );
};
