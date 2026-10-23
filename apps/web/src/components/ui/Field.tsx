import React from 'react';

export interface FieldProps {
  id?: string;
  label?: React.ReactNode;
  optional?: boolean;
  error?: string;
  success?: string;
  hint?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({
  id,
  label,
  optional = false,
  error,
  success,
  hint,
  className = '',
  style,
  children,
}) => {
  return (
    <div className={`cineva-field ${className}`.trim()} style={style}>
      {label && (
        <label htmlFor={id} className="cineva-label">
          {label} {optional && <small>(optional)</small>}
        </label>
      )}
      {children}
      {hint && !error && !success && (
        <p className="hint" style={{ fontSize: 13, marginTop: 4, color: 'var(--text-3)' }}>
          {hint}
        </p>
      )}
      <p
        className={`cineva-msg ${success ? 'ok' : ''}`.trim()}
        role={error ? 'alert' : 'status'}
        aria-live="polite"
      >
        {error || success || ''}
      </p>
    </div>
  );
};
