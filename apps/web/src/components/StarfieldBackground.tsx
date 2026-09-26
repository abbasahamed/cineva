import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number; // depth layer (1 = far, 3 = close)
  radius: number;
  alpha: number;
  baseAlpha: number;
  twinkleSpeed: number;
  color: string;
}

export const StarfieldBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Reduced motion preference check
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Density based on screen width
    const isMobile = width < 768;
    const starCount = isMobile ? 65 : 160;

    const stars: Star[] = [];
    const starColors = [
      '#ffffff',
      '#f1f5f9',
      '#e2e8f0',
      '#c084fc', // Subtle purple accent
      '#818cf8', // Subtle indigo accent
      '#a5b4fc', // Subtle lavender accent
    ];

    // Initialize stars with depth distribution
    for (let i = 0; i < starCount; i++) {
      const z = Math.random() < 0.6 ? 1 : Math.random() < 0.85 ? 2 : 3;
      const baseAlpha = z === 1 ? 0.25 + Math.random() * 0.25 : z === 2 ? 0.45 + Math.random() * 0.3 : 0.7 + Math.random() * 0.25;
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        radius: z === 1 ? 0.6 + Math.random() * 0.4 : z === 2 ? 1.0 + Math.random() * 0.6 : 1.6 + Math.random() * 0.8,
        alpha: baseAlpha,
        baseAlpha,
        twinkleSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() < 0.5 ? 1 : -1),
        color: starColors[Math.floor(Math.random() * starColors.length)],
      });
    }

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const render = () => {
      // 1. Draw Space Environment (Near-black navy space with subtle ambient purple radial glow)
      ctx.fillStyle = '#040508';
      ctx.fillRect(0, 0, width, height);

      // Faint ambient purple nebula glow at top-center
      const glowGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.2,
        10,
        width * 0.5,
        height * 0.2,
        width * 0.65
      );
      glowGrad.addColorStop(0, 'rgba(99, 102, 241, 0.07)'); // Deep indigo
      glowGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.035)'); // Purple accent
      glowGrad.addColorStop(1, 'rgba(4, 5, 8, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Render & Travel Stars
      const centerX = width * 0.5;
      const centerY = height * 0.5;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        if (!prefersReducedMotion) {
          // Slow continuous space travel movement (gently drifting outwards from center)
          const dx = (star.x - centerX) * 0.00015 * star.z;
          const dy = (star.y - centerY) * 0.00015 * star.z + 0.08 * star.z; // Slight forward motion

          star.x += dx;
          star.y += dy;

          // Twinkle effect
          star.alpha += star.twinkleSpeed;
          if (star.alpha > Math.min(1.0, star.baseAlpha + 0.3) || star.alpha < Math.max(0.1, star.baseAlpha - 0.2)) {
            star.twinkleSpeed = -star.twinkleSpeed;
          }

          // Wrap around screen boundaries
          if (star.x < 0) star.x = width;
          if (star.x > width) star.x = 0;
          if (star.y < 0) star.y = height;
          if (star.y > height) star.y = 0;
        }

        // Draw star dot
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.globalAlpha = Math.max(0.05, Math.min(1.0, star.alpha));
        ctx.fill();

        // Extra soft bloom glow for close stars
        if (star.z === 3) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = star.color;
          ctx.globalAlpha = Math.max(0.01, star.alpha * 0.15);
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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0 select-none transition-opacity duration-700"
      aria-hidden="true"
    />
  );
};
