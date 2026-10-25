import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'success' | 'warning' | 'danger';
  size?: 'small' | 'normal';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'normal',
  className = '',
}) => {
  const variantStyles = {
    neutral: 'bg-white/[0.08] text-white/80 border-white/[0.08]',
    success: 'bg-[#5fd68a]/15 text-[#5fd68a] border-[#5fd68a]/20',
    warning: 'bg-[#f5b84b]/15 text-[#f5b84b] border-[#f5b84b]/20',
    danger: 'bg-[#ff6b6b]/15 text-[#ff6b6b] border-[#ff6b6b]/20',
  };

  const sizeStyles = {
    small: 'px-2 py-0.5 text-[11px]',
    normal: 'px-2.5 py-1 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border backdrop-blur-sm ${sizeStyles[size]} ${variantStyles[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
};
