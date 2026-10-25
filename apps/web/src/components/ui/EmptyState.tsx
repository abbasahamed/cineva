import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] ${className}`.trim()}
    >
      {icon && <div className="mb-3 text-white/50">{icon}</div>}
      <h3 className="text-base font-medium text-white/90">{title}</h3>
      {description && <p className="mt-1 text-sm text-white/50 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
