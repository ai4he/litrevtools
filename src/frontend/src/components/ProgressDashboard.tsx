import React, { useState } from 'react';
import { Clock, PlayCircle, PauseCircle, StopCircle, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { ProgressUpdate, SearchParameters } from '../types';
import { formatTime } from '../utils/helpers';

interface ProgressDashboardProps {
  progress: ProgressUpdate;
  sessionId?: string;
  searchParameters?: SearchParameters;
  papers?: Array<{ publicationDate?: string; year: number; title: string }>;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  progress,
  sessionId,
  searchParameters,
  papers,
  onPause,
  onResume,
  onStop,
}) => {
  const [isDebugExpanded, setIsDebugExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [realtimeElapsed, setRealtimeElapsed] = useState<number>(progress.timeElapsed || 0);
  const [searchStartTime] = useState<number>(Date.now() - (progress.timeElapsed || 0));

  // Real-time timer that updates every second when search is running
  React.useEffect(() => {
    let intervalId: number | undefined;

    if (progress.status === 'running') {
      intervalId = setInterval(() => {
        const elapsed = Date.now() - searchStartTime;
        setRealtimeElapsed(elapsed);
      }, 1000) as unknown as number; // Update every second
    } else {
      // When not running, use the progress value
      setRealtimeElapsed(progress.timeElapsed || 0);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [progress.status, progress.timeElapsed, searchStartTime]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const getOldestAndNewestPapers = () => {
    if (!papers || papers.length === 0) return null;

    let oldest = papers[0];
    let newest = papers[0];

    for (const paper of papers) {
      const paperDate = paper.publicationDate ? new Date(paper.publicationDate) : new Date(paper.year, 0, 1);
      const oldestDate = oldest.publicationDate ? new Date(oldest.publicationDate) : new Date(oldest.year, 0, 1);
      const newestDate = newest.publicationDate ? new Date(newest.publicationDate) : new Date(newest.year, 0, 1);

      if (paperDate < oldestDate) oldest = paper;
      if (paperDate > newestDate) newest = paper;
    }

    return { oldest, newest };
  };

  const formatDebugInfo = () => {
    const info = {
      sessionId,
      searchParameters,
      currentStatus: progress.status,
      progress: `${progress.progress}%`,
      statistics: {
        totalPapers: progress.totalPapers,
        includedPapers: progress.includedPapers,
        excludedPapers: progress.excludedPapers,
        processedPapers: progress.processedPapers,
        duplicateCount: progress.duplicateCount
      }
    };
    return JSON.stringify(info, null, 2);
  };

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
              {formatTime(realtimeElapsed)}
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

      {/* Paper Date Range */}
      {(() => {
        const dateRange = getOldestAndNewestPapers();
        if (!dateRange || !papers || papers.length === 0) return null;

        const formatPaperDate = (paper: typeof dateRange.oldest) => {
          if (paper.publicationDate) {
            return new Date(paper.publicationDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });
          }
          return `${paper.year}`;
        };

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">📜</span>
                <h4 className="text-sm font-semibold text-blue-900">Oldest Retrieved Paper</h4>
              </div>
              <p className="text-sm text-blue-800 font-semibold mb-1">
                {formatPaperDate(dateRange.oldest)}
              </p>
              <p className="text-xs text-blue-700 line-clamp-2" title={dateRange.oldest.title}>
                {dateRange.oldest.title}
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">📄</span>
                <h4 className="text-sm font-semibold text-green-900">Newest Retrieved Paper</h4>
              </div>
              <p className="text-sm text-green-800 font-semibold mb-1">
                {formatPaperDate(dateRange.newest)}
              </p>
              <p className="text-xs text-green-700 line-clamp-2" title={dateRange.newest.title}>
                {dateRange.newest.title}
              </p>
            </div>
          </div>
        );
      })()}

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

      {/* Debug Information */}
      {(sessionId || searchParameters) && (
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => setIsDebugExpanded(!isDebugExpanded)}
            className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">Search Details & Debug Info</span>
              {sessionId && (
                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded font-mono">
                  {sessionId.substring(0, 12)}...
                </span>
              )}
            </div>
            {isDebugExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>

          {isDebugExpanded && (
            <div className="mt-3 space-y-3">
              {/* Session ID */}
              {sessionId && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">Session ID</h4>
                    <button
                      onClick={() => copyToClipboard(sessionId, 'sessionId')}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      {copiedField === 'sessionId' ? (
                        <>
                          <Check size={14} className="text-green-600" />
                          <span className="text-green-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <code className="text-xs font-mono text-gray-600 break-all">{sessionId}</code>
                </div>
              )}

              {/* Search Parameters */}
              {searchParameters && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700">Search Parameters</h4>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(searchParameters, null, 2), 'parameters')}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    >
                      {copiedField === 'parameters' ? (
                        <>
                          <Check size={14} className="text-green-600" />
                          <span className="text-green-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="space-y-2 text-sm">
                    {searchParameters.name && (
                      <div>
                        <span className="font-medium text-gray-700">Name:</span>{' '}
                        <span className="text-gray-600">{searchParameters.name}</span>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-700">Inclusion Keywords:</span>{' '}
                      <span className="text-gray-600">{searchParameters.inclusionKeywords.join(', ')}</span>
                    </div>
                    {searchParameters.exclusionKeywords.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700">Exclusion Keywords:</span>{' '}
                        <span className="text-gray-600">{searchParameters.exclusionKeywords.join(', ')}</span>
                      </div>
                    )}
                    {(searchParameters.startYear || searchParameters.endYear) && (
                      <div>
                        <span className="font-medium text-gray-700">Year Range:</span>{' '}
                        <span className="text-gray-600">
                          {searchParameters.startYear || '?'} - {searchParameters.endYear || '?'}
                        </span>
                      </div>
                    )}
                    {searchParameters.maxResults && (
                      <div>
                        <span className="font-medium text-gray-700">Max Results:</span>{' '}
                        <span className="text-gray-600">{searchParameters.maxResults}</span>
                      </div>
                    )}
                    {searchParameters.llmConfig?.enabled && (
                      <div>
                        <span className="font-medium text-gray-700">LLM Filtering:</span>{' '}
                        <span className="text-green-600 font-medium">Enabled</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Complete Debug Info */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">Complete Debug Info (JSON)</h4>
                  <button
                    onClick={() => copyToClipboard(formatDebugInfo(), 'debug')}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    {copiedField === 'debug' ? (
                      <>
                        <Check size={14} className="text-green-600" />
                        <span className="text-green-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap">
                  {formatDebugInfo()}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
