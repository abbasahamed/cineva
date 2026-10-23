import React, { useRef } from 'react';
import { Link } from 'react-router-dom';

export interface PillLinkProps {
  to: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

export const PillLink: React.FC<PillLinkProps> = ({
  to,
  children,
  icon,
  className = '',
  style,
  'aria-label': ariaLabel,
}) => {
  const ref = useRef<HTMLAnchorElement>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    }
  };

  return (
    <Link
      ref={ref}
      to={to}
      className={`pill glass ${className}`.trim()}
      style={style}
      aria-label={ariaLabel}
      onPointerMove={handlePointerMove}
    >
      {icon}
      {children}
    </Link>
  );
};
