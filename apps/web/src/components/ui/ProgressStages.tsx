import React from 'react';

export interface ProgressStagesProps {
  stages?: string[];
  currentStageIndex: number;
  className?: string;
}

export const ProgressStages: React.FC<ProgressStagesProps> = ({
  stages = ['Uploading', 'Analyzing', 'Converting', 'Ready'],
  currentStageIndex,
  className = '',
}) => {
  return (
    <div className={`cineva-stages ${className}`.trim()}>
      {stages.map((stageName, idx) => {
        const isDone = idx < currentStageIndex;
        const isNow = idx === currentStageIndex;
        const stateClass = isDone ? 'done' : isNow ? 'now' : '';

        return (
          <div key={stageName} className={`cineva-stage ${stateClass}`.trim()}>
            <span className="d">
              <svg viewBox="0 0 24 24">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <span>{stageName}</span>
          </div>
        );
      })}
    </div>
  );
};
