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

interface Particle {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speedX: number;
  speedY: number;
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

    // Density based on variant and device
    const isBlurred = variant === 'blurred';
    const isSubtle = variant === 'subtle';
    const isCinema = variant === 'cinema';

    const baseCount = isBlurred
      ? (isMobile ? 40 : 85)
      : isCinema
      ? (isMobile ? 30 : 65)
      : isSubtle
      ? (isMobile ? 50 : 110)
      : isMobile ? 150 : 340; // Rich depth star capacity on dark canvas

    // Very slow, calm cinematic movement
    const speedFactor = (isBlurred ? 0.25 : isCinema ? 0.2 : isSubtle ? 0.3 : 0.35);
    const alphaMultiplier = isBlurred ? 0.6 : isCinema ? 0.45 : isSubtle ? 0.7 : 1.05;

    const stars: Star[] = [];
    const starColors = isBlurred
      ? ['#ffffff', '#e2e8f0', '#c084fc', '#a5b4fc']
      : ['#ffffff', '#f1f5f9', '#e2e8f0', '#c084fc', '#818cf8', '#a5b4fc', '#cbd5e1', '#d8b4fe'];

    // Multi-layer depth distribution: z=1 (distant, 60%), z=2 (mid, 28%), z=3 (foreground, 12%)
    for (let i = 0; i < baseCount; i++) {
      const z = Math.random() < 0.60 ? 1 : Math.random() < 0.88 ? 2 : 3;
      const baseAlpha =
        (z === 1 ? 0.16 + Math.random() * 0.20 : z === 2 ? 0.32 + Math.random() * 0.22 : 0.52 + Math.random() * 0.26) *
        alphaMultiplier;

      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        radius:
          (z === 1 ? 0.45 + Math.random() * 0.35 : z === 2 ? 0.75 + Math.random() * 0.35 : 1.2 + Math.random() * 0.45) *
          (isBlurred ? 1.1 : 1.0),
        alpha: baseAlpha,
        baseAlpha,
        twinkleSpeed: (Math.random() * 0.009 + 0.003) * (Math.random() < 0.5 ? 1 : -1),
        color: starColors[Math.floor(Math.random() * starColors.length)],
      });
    }

    // Atmospheric subtle purple-tinted particles (floating motes)
    const particleCount = isMobile ? 16 : 30;
    const particles: Particle[] = [];
    const particleColors = [
      'rgba(168, 85, 247, 0.07)',
      'rgba(139, 92, 246, 0.06)',
      'rgba(99, 102, 241, 0.06)',
      'rgba(129, 140, 248, 0.05)',
    ];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 1.5 + Math.random() * 1.8,
        alpha: 0.04 + Math.random() * 0.06,
        speedX: (Math.random() - 0.5) * 0.07,
        speedY: (Math.random() - 0.5) * 0.07,
        color: particleColors[Math.floor(Math.random() * particleColors.length)],
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;

      // Render & drift atmospheric motes
      if (!isBlurred) {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (!prefersReducedMotion) {
            p.x += p.speedX;
            p.y += p.speedY;

            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        }
      }

      // Render stars with clean center attenuation
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        if (!prefersReducedMotion) {
          // Extremely slow, graceful outward and upward drift
          const dx = (star.x - cx) * 0.00004 * star.z * speedFactor;
          const dy = ((star.y - cy) * 0.00004 * star.z + 0.025 * star.z) * speedFactor;

          star.x += dx;
          star.y += dy;

          // Occasional gentle twinkle
          star.alpha += star.twinkleSpeed;
          if (star.alpha > Math.min(0.95, star.baseAlpha + 0.22) || star.alpha < Math.max(0.05, star.baseAlpha - 0.18)) {
            star.twinkleSpeed = -star.twinkleSpeed;
          }

          if (star.x < 0) star.x = width;
          if (star.x > width) star.x = 0;
          if (star.y < 0) star.y = height;
          if (star.y > height) star.y = 0;
        }

        // Center attenuation
        const normDx = Math.abs(star.x - cx) / (width * 0.5);
        const normDy = Math.abs(star.y - cy) / (height * 0.5);
        const distFromCenter = Math.min(1.0, Math.hypot(normDx, normDy));
        const centerFactor = 0.55 + 0.45 * distFromCenter;

        const finalAlpha = Math.max(0.04, Math.min(0.95, star.alpha * centerFactor));

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = finalAlpha;
        ctx.fill();

        // Subtle soft bloom for foreground stars
        if (star.z === 3 && !isBlurred && finalAlpha > 0.35) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius * 1.9, 0, Math.PI * 2);
          ctx.fillStyle = star.color;
          ctx.globalAlpha = finalAlpha * 0.16;
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
        {/* Atmosphere Container */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Base space fill */}
          <div className="absolute inset-0 bg-[#040508]" />

          {/* Starfield behind atmospheric clouds */}
          {withStars && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full opacity-55 pointer-events-none"
            />
          )}

          {/* Top-Center / Left Ambient Purple Radial Glow */}
          <div
            className="absolute top-[-5%] left-[20%] w-[750px] h-[550px] rounded-full opacity-70 blur-[100px] pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.12) 45%, transparent 75%)',
            }}
          />

          {/* Bottom-Right Indigo Nebula Glow */}
          <div
            className="absolute bottom-[-5%] right-[15%] w-[700px] h-[500px] rounded-full opacity-60 blur-[90px] pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(79, 70, 229, 0.22) 0%, rgba(67, 56, 202, 0.10) 50%, transparent 75%)',
            }}
          />
        </div>

        {/* Dark atmospheric overlay ensuring optimal form contrast */}
        <div className="absolute inset-0 bg-[#040508]/65 backdrop-blur-[2px] pointer-events-none" />
      </div>
    );
  }

  if (variant === 'cinema') {
    return (
      <div
        className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[#030407]" />
        {/* Very faint distant stars */}
        {withStars && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-35" />}
        {/* Screen Ambient Light source (centered behind cinema screen) */}
        <div
          className="absolute top-[28%] left-1/2 -translate-x-1/2 w-[1000px] h-[580px] rounded-full opacity-55 pointer-events-none blur-[120px]"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.14) 0%, rgba(139, 92, 246, 0.07) 40%, rgba(79, 70, 229, 0.02) 70%, transparent 85%)',
          }}
        />
        {/* Theater Ambient Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(2, 3, 6, 0.82) 100%)',
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
        {withStars && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-55" />}
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[450px] rounded-full opacity-45 blur-[110px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.18) 0%, rgba(139, 92, 246, 0.07) 50%, transparent 75%)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[500px] h-[380px] rounded-full opacity-35 blur-[100px] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(79, 70, 229, 0.15) 0%, transparent 70%)',
          }}
        />
      </div>
    );
  }

  // Default 'home' variant: Deep black canvas with subtle, restrained purplish ambient lighting
  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[#020306]" />
      {withStars && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />}
      {/* Primary Top-Center Ambient Purple Glow behind Hero Header */}
      <div
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[1050px] h-[600px] rounded-full opacity-75 blur-[100px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(129, 140, 248, 0.24) 0%, rgba(139, 92, 246, 0.12) 35%, rgba(79, 70, 229, 0.04) 60%, transparent 75%)',
        }}
      />
      {/* Mid/Bottom-Right Subtle Indigo Accent */}
      <div
        className="absolute top-[32%] right-[-6%] w-[680px] h-[500px] rounded-full opacity-40 blur-[110px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(147, 51, 234, 0.10) 0%, rgba(99, 102, 241, 0.04) 45%, transparent 70%)',
        }}
      />
      {/* Bottom-Left Deep Violet Ambient Accent */}
      <div
        className="absolute bottom-[-10%] left-[-6%] w-[600px] h-[450px] rounded-full opacity-30 blur-[110px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(79, 70, 229, 0.08) 0%, transparent 70%)',
        }}
      />
    </div>
  );
};

// Also export as AmbientBackground for convenience
export const AmbientBackground = CinematicBackground;
