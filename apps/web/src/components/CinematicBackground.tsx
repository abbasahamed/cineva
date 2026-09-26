import React, { useEffect, useRef } from 'react';

export type BackgroundVariant = 'home' | 'blurred' | 'subtle' | 'cinema';

interface CinematicBackgroundProps {
  variant?: BackgroundVariant;
  withStars?: boolean;
  className?: string;
}

interface Star {
  x: number;
  y: number;
  z: number;
  radius: number;
  alpha: number;
  baseAlpha: number;
  twinkleSpeed: number;
  color: string;
}

export const CinematicBackground: React.FC<CinematicBackgroundProps> = ({
  variant = 'home',
  withStars = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!withStars) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = width < 768;

    // Adjust density and opacity based on variant (with 30% density & speed boost)
    const isBlurred = variant === 'blurred';
    const isSubtle = variant === 'subtle';
    const isCinema = variant === 'cinema';

    const rawBaseCount = isBlurred
      ? (isMobile ? 30 : 65)
      : isCinema
      ? (isMobile ? 20 : 45)
      : isSubtle
      ? (isMobile ? 35 : 80)
      : isMobile ? 60 : 150;
    const baseCount = Math.round(rawBaseCount * 1.3); // 30% star capacity increase

    const rawSpeedFactor = isBlurred ? 0.45 : isCinema ? 0.35 : isSubtle ? 0.6 : 1.0;
    const speedFactor = rawSpeedFactor * 1.3 * 1.5; // Increased by 1.5x (current speed x 1.5)

    const alphaMultiplier = isBlurred ? 0.55 : isCinema ? 0.45 : isSubtle ? 0.7 : 1.0;

    const stars: Star[] = [];
    const starColors = isBlurred
      ? ['#ffffff', '#e2e8f0', '#c084fc', '#a5b4fc']
      : ['#ffffff', '#f1f5f9', '#e2e8f0', '#c084fc', '#818cf8', '#a5b4fc'];

    for (let i = 0; i < baseCount; i++) {
      const z = Math.random() < 0.65 ? 1 : Math.random() < 0.9 ? 2 : 3;
      const baseAlpha =
        (z === 1 ? 0.2 + Math.random() * 0.2 : z === 2 ? 0.4 + Math.random() * 0.25 : 0.65 + Math.random() * 0.25) *
        alphaMultiplier;

      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        radius:
          (z === 1 ? 0.5 + Math.random() * 0.35 : z === 2 ? 0.9 + Math.random() * 0.45 : 1.4 + Math.random() * 0.6) *
          (isBlurred ? 1.2 : 1.0),
        alpha: baseAlpha,
        baseAlpha,
        twinkleSpeed: (Math.random() * 0.018 + 0.004) * (Math.random() < 0.5 ? 1 : -1) * 1.3 * 1.5,
        color: starColors[Math.floor(Math.random() * starColors.length)],
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const centerX = () => width * 0.5;
    const centerY = () => height * 0.5;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const cx = centerX();
      const cy = centerY();

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        if (!prefersReducedMotion) {
          const dx = (star.x - cx) * 0.00012 * star.z * speedFactor;
          const dy = ((star.y - cy) * 0.00012 * star.z + 0.06 * star.z) * speedFactor;

          star.x += dx;
          star.y += dy;

          star.alpha += star.twinkleSpeed;
          if (star.alpha > Math.min(1.0, star.baseAlpha + 0.25) || star.alpha < Math.max(0.05, star.baseAlpha - 0.2)) {
            star.twinkleSpeed = -star.twinkleSpeed;
          }

          if (star.x < 0) star.x = width;
          if (star.x > width) star.x = 0;
          if (star.y < 0) star.y = height;
          if (star.y > height) star.y = 0;
        }

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = Math.max(0.04, Math.min(1.0, star.alpha));
        ctx.fill();

        if (star.z === 3 && !isBlurred) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius * 2.0, 0, Math.PI * 2);
          ctx.fillStyle = star.color;
          ctx.globalAlpha = Math.max(0.01, star.alpha * 0.12);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1.0;

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [variant, withStars]);

  if (variant === 'blurred') {
    return (
      <div
        className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
        aria-hidden="true"
      >
        {/* Scaled and Blurred Atmosphere Container to eliminate edge blur artifacts */}
        <div
          className="absolute inset-[-8%] w-[116%] h-[116%] pointer-events-none transform scale-110 blur-[45px] sm:blur-[55px] will-change-transform"
          style={{ transform: 'scale(1.12)' }}
        >
          {/* Base space fill */}
          <div className="absolute inset-0 bg-[#040508]" />

          {/* Starfield behind atmospheric clouds */}
          {withStars && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full opacity-60 pointer-events-none"
            />
          )}

          {/* Top-Center / Left Ambient Purple Cloud (Enhanced Glow) */}
          <div
            className="absolute top-[5%] left-[18%] w-[750px] h-[580px] rounded-full opacity-80"
            style={{
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.30) 0%, rgba(139, 92, 246, 0.19) 40%, rgba(168, 85, 247, 0.07) 70%, transparent 85%)',
            }}
          />

          {/* Bottom-Right Indigo Nebula (Enhanced Glow) */}
          <div
            className="absolute bottom-[10%] right-[12%] w-[700px] h-[520px] rounded-full opacity-75"
            style={{
              background: 'radial-gradient(circle, rgba(79, 70, 229, 0.28) 0%, rgba(67, 56, 202, 0.17) 45%, transparent 75%)',
            }}
          />

          {/* Subtle Deep Violet Center-Refraction */}
          <div
            className="absolute top-[45%] left-[38%] w-[520px] h-[400px] rounded-full opacity-60"
            style={{
              background: 'radial-gradient(circle, rgba(168, 85, 247, 0.19) 0%, transparent 70%)',
            }}
          />
        </div>

        {/* Dark atmospheric overlay ensuring optimal form contrast */}
        <div className="absolute inset-0 bg-[#05060a]/60 sm:bg-[#05060a]/65 backdrop-blur-[2px] pointer-events-none" />
      </div>
    );
  }

  if (variant === 'cinema') {
    return (
      <div
        className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[#040507]" />
        {/* Very faint distant stars */}
        {withStars && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-40" />}
        {/* Screen Ambient Light source (centered behind cinema screen - Enhanced Glow) */}
        <div
          className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[1020px] h-[620px] rounded-full opacity-70 pointer-events-none blur-[140px]"
          style={{
            background: 'radial-gradient(ellipse, rgba(99, 102, 241, 0.17) 0%, rgba(139, 92, 246, 0.09) 40%, rgba(79, 70, 229, 0.03) 70%, transparent 85%)',
          }}
        />
        {/* Theater Ambient Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(3, 4, 7, 0.75) 100%)',
          }}
        />
      </div>
    );
  }

  if (variant === 'subtle') {
    return (
      <div
        className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[#040508]" />
        {withStars && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-70" />}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[650px] h-[420px] bg-brand-500/[0.09] rounded-full blur-[130px]" />
        <div className="absolute bottom-0 right-0 w-[480px] h-[360px] bg-indigo-600/[0.06] rounded-full blur-[120px]" />
      </div>
    );
  }

  // Default 'home' variant: Enhanced Crisp Cinematic Atmosphere (with 70% reduced Gaussian blur for sharp detail)
  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[#040508]" />
      {withStars && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />}
      {/* Primary Top-Center Ambient Glow (42px blur: 70% reduction from 140px) */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[880px] h-[560px] bg-brand-500/[0.16] rounded-full blur-[42px]" />
      {/* Mid/Bottom-Right Indigo Glow (39px blur: 70% reduction from 130px) */}
      <div className="absolute top-[38%] right-[-5%] w-[650px] h-[520px] bg-indigo-600/[0.10] rounded-full blur-[39px]" />
      {/* Subtle Bottom-Left Violet Accent (39px blur: 70% reduction from 130px) */}
      <div className="absolute bottom-[-10%] left-[-5%] w-[550px] h-[480px] bg-purple-600/[0.07] rounded-full blur-[39px]" />
    </div>
  );
};

// Also export as AmbientBackground for convenience
export const AmbientBackground = CinematicBackground;
