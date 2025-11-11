import React, { useEffect, useState } from 'react';
import { Clock, PlayCircle, PauseCircle, StopCircle, CheckCircle, AlertCircle, Activity, Database, TrendingUp } from 'lucide-react';
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
  // Running timer that updates every second
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate real-time elapsed time
  const displayTimeElapsed = progress.status === 'running' || progress.status === 'estimating'
    ? currentTime - (currentTime - progress.timeElapsed) // This keeps ticking
    : progress.timeElapsed;
  const getStatusIcon = () => {
    switch (progress.status) {
      case 'running':
        return <PlayCircle className="text-green-600" size={24} />;
      case 'estimating':
        return <TrendingUp className="text-blue-600" size={24} />;
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
      case 'estimating':
        return 'bg-blue-100 text-blue-800';
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

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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
          <span>
            {progress.processedPapers} / {progress.estimatedTotalPapers || progress.totalPapers || '?'} papers
            {progress.estimatedTotalPapers && ' (estimated)'}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              progress.status === 'running' || progress.status === 'estimating'
                ? 'bg-gradient-to-r from-primary-500 to-primary-700 progress-bar-animated'
                : progress.status === 'completed'
                ? 'bg-green-600'
                : 'bg-primary-600'
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
            <p className="text-xs text-gray-500">Time Elapsed (Live)</p>
            <p className="text-lg font-semibold text-gray-900 font-mono">
              {formatTime(displayTimeElapsed)}
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

      {/* Estimation Info */}
      {progress.isEstimating && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="text-blue-600" size={20} />
            <h4 className="text-sm font-semibold text-blue-900">Estimating Total Papers</h4>
          </div>
          <p className="text-sm text-blue-800">
            Analyzing search results to estimate total papers available...
          </p>
          {progress.estimatedTotalPapers && (
            <p className="text-sm text-blue-900 font-semibold mt-2">
              Estimated: ~{progress.estimatedTotalPapers} papers
            </p>
          )}
        </div>
      )}

      {/* API Call Details */}
      {progress.lastApiCall && !progress.isEstimating && (
        <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="text-indigo-600" size={20} />
            <h4 className="text-sm font-semibold text-indigo-900">Last API Request</h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {progress.lastApiCall.year && (
              <div>
                <p className="text-indigo-600 font-medium">Year</p>
                <p className="text-indigo-900 font-semibold">{progress.lastApiCall.year}</p>
              </div>
            )}
            <div>
              <p className="text-indigo-600 font-medium">Requested</p>
              <p className="text-indigo-900 font-semibold">{progress.lastApiCall.recordsRequested}</p>
            </div>
            <div>
              <p className="text-indigo-600 font-medium">Received</p>
              <p className="text-indigo-900 font-semibold">{progress.lastApiCall.recordsReceived}</p>
            </div>
            <div>
              <p className="text-indigo-600 font-medium">Offset</p>
              <p className="text-indigo-900 font-semibold">{progress.lastApiCall.offset}</p>
            </div>
          </div>
        </div>
      )}

      {/* Estimated Total Display */}
      {progress.estimatedTotalPapers && !progress.isEstimating && (
        <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
          <Database className="text-purple-600" size={18} />
          <span className="text-sm text-purple-900">
            <span className="font-semibold">Estimated Total:</span> ~{progress.estimatedTotalPapers} papers
          </span>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-gray-200">
        <div className="text-center">
          <p className="text-2xl font-bold text-primary-600">{progress.totalPapers}</p>
          <p className="text-sm text-gray-500">Total Papers</p>
        </div>
        {progress.duplicateCount !== undefined && progress.duplicateCount > 0 && (
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">{progress.duplicateCount}</p>
            <p className="text-sm text-gray-500">Duplicates</p>
          </div>
        )}
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
