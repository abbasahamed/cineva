import React from 'react';
import { Link } from 'react-router-dom';

export interface LogoProps {
  to?: string;
  variant?: 'simple' | 'badge';
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({
  to = '/',
  variant = 'simple',
  className = '',
}) => {
  const content = variant === 'badge' ? (
    <>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(145deg, #fff, #cfc9ff)',
          color: '#2a1f6b',
          boxShadow: '0 4px 14px rgba(123, 107, 255, 0.5)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: 18, height: 18 }}
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="4" />
          <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
        </svg>
      </span>
      <span>Cineva</span>
    </>
  ) : (
    <>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 22, height: 22 }}
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="3.5" />
        <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
      </svg>
      <span>Cineva</span>
    </>
  );

  return (
    <Link
      to={to}
      className={`logo ${className}`.trim()}
      aria-label="Cineva home"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontWeight: variant === 'badge' ? 650 : 600,
        fontSize: variant === 'badge' ? 19 : 18,
        letterSpacing: '-0.02em',
      }}
    >
      {content}
    </Link>
  );
};
