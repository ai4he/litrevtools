import React from 'react';
import { Clock, PlayCircle, PauseCircle, StopCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { ProgressUpdate } from '../types';
import { formatTime } from '../utils/helpers';

interface ProgressDashboardProps {
  progress: ProgressUpdate;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  progress,
  onPause,
  onResume,
  onStop,
}) => {
  const getStatusIcon = () => {
    switch (progress.status) {
      case 'running':
        return <PlayCircle className="text-green-600" size={24} />;
      case 'paused':
        return <PauseCircle className="text-yellow-600" size={24} />;
      case 'completed':
        return <CheckCircle className="text-green-600" size={24} />;
      case 'error':
        return <AlertCircle className="text-red-600" size={24} />;
      default:
        return <Clock className="text-gray-600" size={24} />;
    }
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case 'running':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="card space-y-6">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-gray-900">Search Progress</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
                {progress.status.toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {progress.includedPapers} included, {progress.excludedPapers} excluded
            </p>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex gap-2">
          {progress.status === 'running' && onPause && (
            <button onClick={onPause} className="btn-secondary flex items-center gap-2">
              <PauseCircle size={18} />
              Pause
            </button>
          )}
          {progress.status === 'paused' && onResume && (
            <button onClick={onResume} className="btn-primary flex items-center gap-2">
              <PlayCircle size={18} />
              Resume
            </button>
          )}
          {(progress.status === 'running' || progress.status === 'paused') && onStop && (
            <button
              onClick={onStop}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <StopCircle size={18} />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Progress: {Math.round(progress.progress)}%</span>
          <span>{progress.processedPapers} / {progress.totalPapers || '?'} papers</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className={`h-full bg-primary-600 transition-all duration-300 ${
              progress.status === 'running' ? 'progress-bar-animated' : ''
            }`}
            style={{ width: `${Math.min(progress.progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Current Task & Next Task */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">Current Task</h4>
          <p className="text-sm text-blue-800">{progress.currentTask || 'Initializing...'}</p>
        </div>
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
          <h4 className="text-sm font-semibold text-purple-900 mb-2">Next Task</h4>
          <p className="text-sm text-purple-800">{progress.nextTask || 'Pending...'}</p>
        </div>
      </div>

      {/* Time Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
          <Clock className="text-gray-600" size={20} />
          <div>
            <p className="text-xs text-gray-500">Time Elapsed</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatTime(progress.timeElapsed)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
          <Clock className="text-gray-600" size={20} />
          <div>
            <p className="text-xs text-gray-500">Estimated Remaining</p>
            <p className="text-lg font-semibold text-gray-900">
              {progress.estimatedTimeRemaining > 0
                ? formatTime(progress.estimatedTimeRemaining)
                : 'Calculating...'}
            </p>
          </div>
        </div>
        {progress.currentYear && (
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="text-gray-600 text-2xl font-bold">📅</div>
            <div>
              <p className="text-xs text-gray-500">Current Year</p>
              <p className="text-lg font-semibold text-gray-900">{progress.currentYear}</p>
            </div>
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
        <div className="text-center">
          <p className="text-2xl font-bold text-primary-600">{progress.totalPapers}</p>
          <p className="text-sm text-gray-500">Total Papers</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{progress.includedPapers}</p>
          <p className="text-sm text-gray-500">Included</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600">{progress.excludedPapers}</p>
          <p className="text-sm text-gray-500">Excluded</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{progress.processedPapers}</p>
          <p className="text-sm text-gray-500">Processed</p>
        </div>
      </div>
    </div>
  );
};
