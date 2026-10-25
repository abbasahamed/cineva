import React from 'react';

export interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return (
    <div
      className={`animate-pulse bg-white/[0.06] rounded-md ${className}`.trim()}
      style={style}
    />
  );
};
