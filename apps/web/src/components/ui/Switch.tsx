import React from 'react';

export interface SwitchProps {
  label: React.ReactNode;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  label,
  hint,
  checked,
  onChange,
  ariaLabel,
  className = '',
}) => {
  return (
    <div className={`cineva-switch ${className}`.trim()}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button
        type="button"
        className="cineva-sw"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || (typeof label === 'string' ? label : 'Toggle switch')}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
};
