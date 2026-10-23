import React from 'react';

export interface FileRowProps {
  filename: string;
  subtitle?: string;
  onRemove: () => void;
  className?: string;
}

export const FileRow: React.FC<FileRowProps> = ({
  filename,
  subtitle,
  onRemove,
  className = '',
}) => {
  return (
    <div className={`cineva-file ${className}`.trim()}>
      <div className="ico">
        <svg viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M10 9.5l5 2.5-5 2.5z" />
        </svg>
      </div>
      <div className="meta">
        <div className="name">{filename}</div>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      <button
        type="button"
        className="x"
        onClick={onRemove}
        aria-label="Remove file"
      >
        <svg viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
};
