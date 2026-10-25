import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'white' | 'glass';
  size?: 'normal' | 'small' | 'large';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'normal',
  icon,
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  let baseClass = 'inline-flex items-center justify-center font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 disabled:cursor-not-allowed';
  
  // Size classes
  let sizeClass = 'h-11 px-5 text-[15px] rounded-full';
  if (size === 'small') {
    sizeClass = 'h-8 px-3 text-[13px] rounded-full';
  } else if (size === 'large') {
    sizeClass = 'h-13 px-7 text-[16px] rounded-full';
  }

  // Variant classes
  let variantClass = '';
  if (variant === 'primary') {
    // Near-white pill with near-black text as defined in tokens
    variantClass = 'bg-white/90 text-black/85 hover:bg-white active:scale-[0.98] shadow-sm';
  } else if (variant === 'secondary') {
    variantClass = 'glass text-white/90 hover:bg-white/10 active:scale-[0.98] border border-white/10';
  } else if (variant === 'ghost') {
    variantClass = 'bg-transparent text-white/70 hover:text-white hover:bg-white/5 active:scale-[0.98]';
  } else if (variant === 'danger') {
    variantClass = 'bg-[#ff6b6b]/20 text-[#ff6b6b] border border-[#ff6b6b]/30 hover:bg-[#ff6b6b]/30 active:scale-[0.98]';
  } else if (variant === 'icon') {
    sizeClass = size === 'small' ? 'w-8 h-8 rounded-full p-0' : size === 'large' ? 'w-12 h-12 rounded-full p-0' : 'w-10 h-10 rounded-full p-0';
    variantClass = 'glass text-white/80 hover:text-white hover:bg-white/10 active:scale-[0.96] border border-white/10';
  } else if (variant === 'white') {
    variantClass = 'btn w';
    if (size === 'large') variantClass += ' lgx';
    if (size === 'small') variantClass += ' s';
  } else if (variant === 'glass') {
    variantClass = 'btn g lg';
    if (size === 'large') variantClass += ' lgx';
    if (size === 'small') variantClass += ' s';
  }

  return (
    <button
      className={`${baseClass} ${sizeClass} ${variantClass} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin mr-2"
          aria-hidden="true"
        />
      ) : icon ? (
        <span className={children ? 'mr-2 inline-flex items-center' : 'inline-flex items-center'}>
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
};
