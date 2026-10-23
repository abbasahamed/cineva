import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'white' | 'glass';
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
  let variantClass = 'cineva-btn';
  if (variant === 'ghost') {
    variantClass = 'cineva-btn ghost';
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
      className={`${variantClass} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            display: 'inline-block',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
};
