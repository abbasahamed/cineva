import React from 'react';

export interface AvatarProps {
  name: string;
  size?: 'small' | 'normal' | 'large';
  className?: string;
  isSpeaking?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = 'normal',
  className = '',
  isSpeaking = false,
}) => {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const sizeStyles = {
    small: 'w-7 h-7 text-xs',
    normal: 'w-9 h-9 text-sm',
    large: 'w-12 h-12 text-base',
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full font-semibold select-none bg-white/[0.08] text-white/90 border border-white/[0.12] ${
        isSpeaking ? 'ring-2 ring-[#5fd68a]' : ''
      } ${sizeStyles[size]} ${className}`.trim()}
      title={name}
      aria-label={name}
    >
      {initials}
    </div>
  );
};
