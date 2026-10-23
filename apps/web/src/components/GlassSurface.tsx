import React, { useRef, useImperativeHandle } from 'react';

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  variant?: 'glass' | 'lg' | 'pill' | 'card';
  children?: React.ReactNode;
}

export const GlassSurface = React.forwardRef<HTMLElement, GlassSurfaceProps>(
  ({ as: Component = 'div', variant = 'glass', className = '', style, children, onPointerMove, ...props }, forwardedRef) => {
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

    const variantClass = variant === 'lg' ? 'lg' : variant === 'card' ? 'glass card-glass' : variant === 'pill' ? 'glass pill-glass' : 'glass';

    return (
      <Component
        ref={internalRef}
        className={`${variantClass} ${className}`.trim()}
        style={style}
        onPointerMove={handlePointerMove}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

GlassSurface.displayName = 'GlassSurface';
