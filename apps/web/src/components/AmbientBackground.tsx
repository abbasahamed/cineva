import React from 'react';

export interface AmbientBackgroundProps {
  variant?: 'ambient' | 'aurora';
  still?: boolean;
  className?: string;
}

/**
 * Ambient backdrop component providing refractive color fields and optional blurred film-still.
 * Supports 'ambient' (for Create and Join pages) and 'aurora' (for Landing page).
 */
export const AmbientBackground: React.FC<AmbientBackgroundProps> = ({
  variant = 'ambient',
  still = true,
  className = '',
}) => {
  if (variant === 'aurora') {
    return (
      <div className={`aurora ${className}`.trim()} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
    );
  }

  return (
    <div className={`ambient ${className}`.trim()} aria-hidden="true">
      <i />
      <i />
      <i />
      {still && <div className="still" />}
    </div>
  );
};
