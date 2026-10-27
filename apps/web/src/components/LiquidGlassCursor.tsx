import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

export const LiquidGlassCursor: React.FC = () => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine) return; // Do not mount on mobile / touch devices

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supportsBackdrop =
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      (CSS.supports('backdrop-filter', 'blur(1px)') ||
       CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));

    if (!supportsBackdrop) return;

    const cursorEl = cursorRef.current;
    if (!cursorEl) return;

    const isChromium = !!(navigator as unknown as { userAgentData?: { brands: Array<{ brand: string }> } })
      .userAgentData?.brands?.some((b) => /Chromium|Chrome/i.test(b.brand)) ||
      /Chrome|Chromium/i.test(navigator.userAgent);

    if (isChromium) {
      cursorEl.classList.add('has-refract');
    }

    const makeLensMap = (size = 48, bezel = 8): string => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        if (!ctx) return '';
        const img = ctx.createImageData(size, size);
        const r = size / 2;

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const dx = x + 0.5 - r;
            const dy = y + 0.5 - r;
            const d = Math.hypot(dx, dy);
            const i = (y * size + x) * 4;
            let R = 128;
            let G = 128;

            if (d < r && d > r - bezel) {
              const e = (d - (r - bezel)) / bezel; // 0 inside -> 1 at perimeter
              const mag = Math.pow(e, 2.2); // sharp magnification at edge
              R = 128 - (dx / d) * mag * 127;
              G = 128 - (dy / d) * mag * 127;
            }

            img.data[i] = R;
            img.data[i + 1] = G;
            img.data[i + 2] = 128;
            img.data[i + 3] = 255;
          }
        }

        ctx.putImageData(img, 0, 0);
        return c.toDataURL();
      } catch {
        return '';
      }
    };

    if (feImageRef.current) {
      const mapUrl = makeLensMap(48, 8);
      if (mapUrl) {
        feImageRef.current.setAttribute('href', mapUrl);
      }
    }

    let hasMoved = false;
    let tx = -100;
    let ty = -100;
    let x = -100;
    let y = -100;
    let vx = 0;
    let vy = 0;
    let scale = 1;
    let scaleT = 1;
    let pressed = false;
    let isOverInput = false;
    let last = performance.now();
    let animId: number;

    const updatePosition = (clientX: number, clientY: number) => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
      tx = clientX;
      ty = clientY;
      if (!hasMoved) {
        hasMoved = true;
        x = clientX;
        y = clientY;
      }
      cursorEl.classList.add('is-on');
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      updatePosition(e.clientX, e.clientY);
    };

    const handleMouseMove = (e: MouseEvent) => {
      updatePosition(e.clientX, e.clientY);
    };

    const handlePointerLeave = () => {
      cursorEl.classList.remove('is-on');
    };

    const handlePointerDown = () => {
      pressed = true;
    };

    const handlePointerUp = () => {
      pressed = false;
    };

    const handlePointerOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
        updatePosition(e.clientX, e.clientY);
      }

      // Avoid layering displacement filters over existing glass surfaces.
      const isOverGlass = !!target.closest('.nav, .glass, .pill, [data-glass]');
      if (isOverGlass) {
        cursorEl.classList.add('is-over-glass');
      } else {
        cursorEl.classList.remove('is-over-glass');
      }

      if (target.closest('input, textarea, [contenteditable="true"]')) {
        isOverInput = true;
        scaleT = 0.2;
        cursorEl.classList.add('is-hidden');
        return;
      }
      isOverInput = false;
      cursorEl.classList.remove('is-hidden');

      const interactive = target.closest('a, button, [role="button"], [data-cursor]');
      if (interactive) {
        const customCursor = (interactive as HTMLElement).dataset.cursor;
        scaleT = customCursor === 'big' ? 1.85 : 1.45;
      } else {
        scaleT = 1;
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointerover', handlePointerOver, { passive: true });

    const TAU = reduce ? 0.0001 : 0.075;

    const render = (now: number) => {
      const rawDt = (now - last) / 1000;
      last = now;
      const dt = Math.max(0.001, Math.min(0.05, Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 0.016));

      const k = 1 - Math.exp(-dt / TAU);
      const px = x;
      const py = y;
      x += (tx - x) * k;
      y += (ty - y) * k;

      if (!Number.isFinite(x)) x = tx;
      if (!Number.isFinite(y)) y = ty;

      const ivx = dt > 0 ? (x - px) / dt : 0;
      const ivy = dt > 0 ? (y - py) / dt : 0;
      vx = Number.isFinite(vx) ? vx + (ivx - vx) * 0.25 : 0;
      vy = Number.isFinite(vy) ? vy + (ivy - vy) * 0.25 : 0;

      if (!Number.isFinite(vx)) vx = 0;
      if (!Number.isFinite(vy)) vy = 0;

      const speed = Math.hypot(vx, vy);
      const stretch = reduce || !Number.isFinite(speed) ? 0 : Math.min(0.22, speed / 5500);
      const ang = (Math.abs(vx) > 0.05 || Math.abs(vy) > 0.05)
        ? (Math.atan2(vy, vx) * 180) / Math.PI
        : 0;

      const targetScale = isOverInput ? 0.2 : pressed ? 0.92 : scaleT;
      scale += (targetScale - scale) * (1 - Math.exp(-dt / 0.09));
      if (!Number.isFinite(scale)) scale = 1;

      if (hasMoved && Number.isFinite(x) && Number.isFinite(y)) {
        cursorEl.style.transform =
          `translate3d(${x}px,${y}px,0) rotate(${ang}deg) ` +
          `scale(${scale * (1 + stretch)},${scale * (1 - stretch * 0.6)}) rotate(${-ang}deg)`;
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    const handleVisibility = () => {
      last = performance.now();
      if (document.hidden) {
        cursorEl.classList.remove('is-on');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <>
      <div ref={cursorRef} className="lg-cursor" aria-hidden="true">
        <span className="lg-rim" />
      </div>

      <svg width="0" height="0" style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', opacity: 0 }} aria-hidden="true">
        <defs>
          <filter
            id="lg-refract"
            x="0"
            y="0"
            width="48"
            height="48"
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage ref={feImageRef} id="lg-map" x="0" y="0" width="48" height="48" result="map" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={8}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
    </>,
    document.body
  );
};
