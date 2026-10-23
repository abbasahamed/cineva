import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ hasError = false, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`cineva-input ${className}`.trim()}
        aria-invalid={hasError}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
