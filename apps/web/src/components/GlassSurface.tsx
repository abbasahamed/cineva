import React, { useRef, useImperativeHandle } from 'react';

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  level?: 'thin' | 'regular' | 'thick';
  variant?: 'glass' | 'lg' | 'pill' | 'card';
  children?: React.ReactNode;
}

export const GlassSurface = React.forwardRef<HTMLElement, GlassSurfaceProps>(
  (
    {
      as: Component = 'div',
      level = 'regular',
      variant = 'glass',
      className = '',
      style,
      children,
      onPointerMove,
      ...props
    },
    forwardedRef
  ) => {
    const internalRef = useRef<HTMLElement>(null);
    useImperativeHandle(forwardedRef, () => internalRef.current as HTMLElement);

    const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
      const el = internalRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        el.style.setProperty('--my', `${e.clientY - rect.top}px`);
      }
      if (onPointerMove) {
        onPointerMove(e);
      }
    };

    const levelStyles: Record<'thin' | 'regular' | 'thick', React.CSSProperties> = {
      thin: {
        ['--glass-bg' as string]: 'rgba(30, 30, 36, 0.38)',
        ['--glass-blur' as string]: '20px',
      },
      regular: {
        ['--glass-bg' as string]: 'rgba(30, 30, 36, 0.52)',
        ['--glass-blur' as string]: '32px',
      },
      thick: {
        ['--glass-bg' as string]: 'rgba(30, 30, 36, 0.72)',
        ['--glass-blur' as string]: '44px',
      },
    };

    const variantClass =
      variant === 'lg'
        ? 'lg'
        : variant === 'card'
        ? 'glass card-glass'
        : variant === 'pill'
        ? 'glass pill-glass'
        : 'glass';

    return (
      <Component
        ref={internalRef}
        className={`${variantClass} ${className}`.trim()}
        style={{ ...levelStyles[level], ...style }}
        onPointerMove={handlePointerMove}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

GlassSurface.displayName = 'GlassSurface';
