import React from 'react';
import { Loader2 } from 'lucide-react';

// Helper function to format time
const formatTime = (ms: number): string => {
  if (!ms || ms < 0) return '--:--';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export interface BatchProgress {
  currentBatch: number;
  totalBatches: number;
  itemsInBatch?: number;
  itemsProcessed: number;
  itemsRemaining: number;
  currentSize?: number; // For document size tracking
  estimatedFinalSize?: number;
}

export interface ProgressCardProps {
  title: string;
  currentTask: string;
  progress: number; // 0-100
  stage?: string; // e.g., "csv", "bibtex", "latex"
  currentStage?: number;
  totalStages?: number;
  timeElapsed?: number;
  estimatedTimeRemaining?: number;
  batchProgress?: BatchProgress;
  error?: string;
  className?: string;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({
  title,
  currentTask,
  progress,
  stage,
  currentStage,
  totalStages,
  timeElapsed,
  estimatedTimeRemaining,
  batchProgress,
  error,
  className = ''
}) => {
  const isError = !!error;
  const bgColor = isError ? 'bg-red-50' : 'bg-blue-50';
  const borderColor = isError ? 'border-red-200' : 'border-blue-200';
  const textColor = isError ? 'text-red-900' : 'text-blue-900';
  const progressColor = isError ? 'from-red-500 to-red-700' : 'from-blue-500 to-blue-700';
  const progressBgColor = isError ? 'bg-red-200' : 'bg-blue-200';

  return (
    <div className={`p-4 ${bgColor} border ${borderColor} rounded-lg space-y-3 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Loader2 className={`animate-spin ${isError ? 'text-red-600' : 'text-blue-600'}`} size={20} />
        <h4 className={`font-semibold ${textColor}`}>{title}</h4>
      </div>

      {/* Current Task & Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${textColor}`}>{currentTask}</span>
          <span className={`text-sm font-semibold ${isError ? 'text-red-700' : 'text-blue-700'}`}>
            {Math.round(progress)}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className={`w-full ${progressBgColor} rounded-full h-3`}>
          <div
            className={`bg-gradient-to-r ${progressColor} h-3 rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          ></div>
        </div>
      </div>

      {/* Stage Info */}
      {(stage || (currentStage !== undefined && totalStages)) && (
        <div className="flex justify-between text-xs text-blue-700">
          {stage && currentStage !== undefined && totalStages && (
            <span className="font-medium">
              Stage {currentStage}/{totalStages}: {stage.toUpperCase()}
            </span>
          )}
          {timeElapsed !== undefined && (
            <span>
              Elapsed: {formatTime(timeElapsed)}
              {estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0 && (
                <> | ETA: {formatTime(estimatedTimeRemaining)}</>
              )}
            </span>
          )}
        </div>
      )}

      {/* Batch Progress Details */}
      {batchProgress && (
        <div className="pt-3 border-t border-blue-300 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-blue-600 font-medium">Batch</p>
              <p className="text-blue-900 font-semibold">
                {batchProgress.currentBatch}/{batchProgress.totalBatches}
              </p>
            </div>
            <div>
              <p className="text-blue-600 font-medium">Items Processed</p>
              <p className="text-blue-900 font-semibold">
                {batchProgress.itemsProcessed}
              </p>
            </div>
            <div>
              <p className="text-blue-600 font-medium">Items Remaining</p>
              <p className="text-blue-900 font-semibold">
                {batchProgress.itemsRemaining}
              </p>
            </div>
            {batchProgress.currentSize !== undefined && (
              <div>
                <p className="text-blue-600 font-medium">Document Size</p>
                <p className="text-blue-900 font-semibold">
                  {formatBytes(batchProgress.currentSize)}
                  {batchProgress.estimatedFinalSize !== undefined && batchProgress.estimatedFinalSize > 0 && (
                    <span className="text-blue-700"> / ~{formatBytes(batchProgress.estimatedFinalSize)}</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="pt-3 border-t border-red-300">
          <p className="text-sm text-red-800 font-medium">Error: {error}</p>
        </div>
      )}
    </div>
  );
};
