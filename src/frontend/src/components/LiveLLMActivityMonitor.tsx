import React from 'react';

interface ActiveStream {
  requestId: string;
  keyLabel: string;
  modelName: string;
  paperId?: string;
  paperTitle?: string;
  tokensReceived: number;
  streamSpeed: number;
  startTime: number;
  status: 'streaming' | 'completing' | 'completed' | 'error';
}

interface LiveLLMActivityMonitorProps {
  activeStreams?: ActiveStream[];
  apiKeyQuotas?: Array<{
    label: string;
    status: string;
    quotaRemaining: number;
    quotaDetails: string;
    healthStatus?: string;
  }>;
  healthyKeysCount?: number;
  currentModel?: string;
}

export const LiveLLMActivityMonitor: React.FC<LiveLLMActivityMonitorProps> = ({
  activeStreams = [],
  apiKeyQuotas = [],
  healthyKeysCount,
  currentModel
}) => {
  // Don't show if no streaming activity and no quota info
  if (activeStreams.length === 0 && apiKeyQuotas.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <div className="absolute inset-0 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>
          </div>
          <span className="text-sm font-semibold text-gray-900">Live LLM Activity</span>
        </div>
        {currentModel && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
            {currentModel}
          </span>
        )}
      </div>

      {/* Active Streaming Requests */}
      {activeStreams.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-700 mb-2">
            Active Streams ({activeStreams.length})
          </div>
          <div className="space-y-2">
            {activeStreams.map((stream) => {
              const elapsedSeconds = (Date.now() - stream.startTime) / 1000;

              return (
                <div
                  key={stream.requestId}
                  className={`p-3 rounded border ${
                    stream.status === 'error'
                      ? 'bg-red-50 border-red-200'
                      : stream.status === 'completed'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-white border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">
                          {stream.keyLabel}
                        </span>
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-mono">
                          {stream.modelName}
                        </span>
                        {stream.status === 'streaming' && (
                          <div className="flex gap-0.5">
                            <div className="w-1 h-3 bg-blue-500 rounded animate-pulse" style={{ animationDelay: '0ms' }}></div>
                            <div className="w-1 h-3 bg-blue-400 rounded animate-pulse" style={{ animationDelay: '150ms' }}></div>
                            <div className="w-1 h-3 bg-blue-300 rounded animate-pulse" style={{ animationDelay: '300ms' }}></div>
                          </div>
                        )}
                        {stream.status === 'completing' && (
                          <span className="text-xs text-yellow-600">Completing...</span>
                        )}
                        {stream.status === 'completed' && (
                          <span className="text-xs text-green-600">✓ Done</span>
                        )}
                        {stream.status === 'error' && (
                          <span className="text-xs text-red-600">✗ Error</span>
                        )}
                      </div>

                      {stream.paperTitle && (
                        <div className="text-xs text-gray-600 truncate mb-1">
                          {stream.paperTitle}
                        </div>
                      )}

                      <div className="flex gap-4 text-xs text-gray-500">
                        <span className="font-mono">
                          {stream.tokensReceived.toLocaleString()} tokens
                        </span>
                        {stream.streamSpeed > 0 && (
                          <span className="font-mono">
                            {stream.streamSpeed.toFixed(1)} tok/s
                          </span>
                        )}
                        <span className="font-mono">
                          {elapsedSeconds.toFixed(1)}s
                        </span>
                      </div>
                    </div>

                    {/* Progress bar based on tokens received */}
                    {stream.status === 'streaming' && stream.tokensReceived > 0 && (
                      <div className="ml-3 w-24">
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                            style={{
                              width: `${Math.min(100, (stream.tokensReceived / 2000) * 100)}%`
                            }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* API Key Status & Quotas */}
      {apiKeyQuotas.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-2">
            <span>API Key Status</span>
            {healthyKeysCount !== undefined && (
              <span className="text-green-600">
                ({healthyKeysCount} healthy)
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {apiKeyQuotas
              .filter(quota => quota.healthStatus === 'Healthy')
              .map((quota, index) => (
                <div
                  key={index}
                  className="bg-white p-2.5 rounded border border-gray-200 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-700">
                      {quota.label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        quota.quotaRemaining > 50
                          ? 'bg-green-100 text-green-700'
                          : quota.quotaRemaining > 20
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {quota.quotaRemaining.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 font-mono">
                    {quota.quotaDetails}
                  </div>

                  {/* Quota bar */}
                  <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        quota.quotaRemaining > 50
                          ? 'bg-green-500'
                          : quota.quotaRemaining > 20
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${quota.quotaRemaining}%` }}
                    ></div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
