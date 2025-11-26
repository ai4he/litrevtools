import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Cpu,
  Clock,
  TrendingUp,
  BarChart3,
  Zap,
  Server,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Play,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { monitoringAPI } from '../utils/api';
import { MonitoringDashboardData, ActiveStep, DailyUsageSummary } from '../types';

interface DashboardMonitorProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const DashboardMonitor: React.FC<DashboardMonitorProps> = ({
  collapsed = false,
  onToggleCollapse
}) => {
  const navigate = useNavigate();
  const [data, setData] = useState<MonitoringDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await monitoringAPI.getDashboard();
      if (response.success) {
        setData(response.data);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err: any) {
      console.error('Failed to fetch monitoring data:', err);
      setError(err.message || 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const getStepName = (step: 1 | 2 | 3): string => {
    switch (step) {
      case 1: return 'Search';
      case 2: return 'Filtering';
      case 3: return 'Generation';
    }
  };

  const getStepColor = (step: 1 | 2 | 3): string => {
    switch (step) {
      case 1: return 'bg-blue-500';
      case 2: return 'bg-purple-500';
      case 3: return 'bg-green-500';
    }
  };

  // Collapsed view
  if (collapsed) {
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-6 border border-gray-200">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <Activity size={20} className="text-blue-500" />
            <span className="font-semibold text-gray-800">System Monitor</span>
            {data && (
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  {data.activeStepsCount > 0 ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-blue-500" />
                      <span>{data.activeStepsCount} active</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} className="text-green-500" />
                      <span>Idle</span>
                    </>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <Zap size={14} className="text-yellow-500" />
                  <span>{data.currentUsage.totalRequests} requests today</span>
                </span>
              </div>
            )}
          </div>
          <ChevronDown size={20} className="text-gray-400" />
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
        <div className="flex items-center justify-center h-32">
          <RefreshCw size={24} className="animate-spin text-blue-500" />
          <span className="ml-2 text-gray-600">Loading monitoring data...</span>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
        <div className="flex items-center justify-center h-32 text-red-500">
          <AlertCircle size={24} />
          <span className="ml-2">{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-left hover:text-blue-600 transition-colors"
        >
          <Activity size={24} className="text-blue-500" />
          <h2 className="text-xl font-bold text-gray-800">System Monitor</h2>
          <ChevronUp size={20} className="text-gray-400" />
        </button>
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchData}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Active Operations */}
      {data.activeSteps.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Play size={14} />
            Active Operations
          </h3>
          <div className="space-y-2">
            {data.activeSteps.map((step: ActiveStep) => (
              <div
                key={step.sessionId}
                className="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors"
                onClick={() => navigate(`/projects/${step.projectId}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${getStepColor(step.step)} animate-pulse`} />
                    <span className="font-medium text-gray-800">{step.projectName}</span>
                    <span className="text-sm text-gray-500">
                      Step {step.step}: {getStepName(step.step)}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-blue-600">
                    {Math.round(step.progress)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1">
                  <div
                    className={`h-1.5 rounded-full ${getStepColor(step.step)} transition-all`}
                    style={{ width: `${step.progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 truncate">{step.currentTask}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Projects Summary */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={18} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-800">Projects</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">{data.projects.total}</div>
          <div className="text-xs text-blue-600 mt-1">
            {data.projects.active} active, {data.projects.completed} completed
          </div>
        </div>

        {/* Today's Requests */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={18} className="text-green-600" />
            <span className="text-sm font-medium text-green-800">Requests Today</span>
          </div>
          <div className="text-2xl font-bold text-green-900">
            {data.currentUsage.totalRequests}
          </div>
          <div className="text-xs text-green-600 mt-1">
            {Object.keys(data.currentUsage.byModel).length} model(s) used
          </div>
        </div>

        {/* Today's Tokens */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={18} className="text-purple-600" />
            <span className="text-sm font-medium text-purple-800">Tokens Today</span>
          </div>
          <div className="text-2xl font-bold text-purple-900">
            {formatTokens(data.currentUsage.totalTokens)}
          </div>
          <div className="text-xs text-purple-600 mt-1">
            {Object.keys(data.currentUsage.byKey).length} API key(s)
          </div>
        </div>

        {/* Server Info */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Server size={18} className="text-gray-600" />
            <span className="text-sm font-medium text-gray-800">Server</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatUptime(data.serverInfo.uptime)}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {formatBytes(data.serverInfo.memoryUsage.heapUsed)} memory
          </div>
        </div>
      </div>

      {/* Model Usage Breakdown */}
      {Object.keys(data.currentUsage.byModel).length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <TrendingUp size={14} />
            Model Usage Today
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(data.currentUsage.byModel).map(([model, usage]) => (
              <div
                key={model}
                className="bg-gray-50 rounded-lg p-3 border border-gray-200"
              >
                <div className="font-medium text-gray-800 text-sm truncate mb-1" title={model}>
                  {model}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {usage.requests} requests
                  </span>
                  <span className="text-gray-600">
                    {formatTokens(usage.tokens)} tokens
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historical Usage Chart (Simple Bar) */}
      {data.historicalUsage.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock size={14} />
            Usage History (7 Days)
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex items-end justify-between h-24 gap-2">
              {data.historicalUsage.map((day: DailyUsageSummary) => {
                const maxRequests = Math.max(
                  ...data.historicalUsage.map((d) => d.totalRequests),
                  1
                );
                const heightPercent = (day.totalRequests / maxRequests) * 100;

                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center"
                    title={`${day.date}: ${day.totalRequests} requests, ${formatTokens(day.totalTokens)} tokens`}
                  >
                    <div
                      className="w-full bg-blue-400 rounded-t transition-all hover:bg-blue-500"
                      style={{ height: `${Math.max(heightPercent, 4)}%` }}
                    />
                    <span className="text-xs text-gray-500 mt-1">
                      {new Date(day.date).toLocaleDateString('en', { weekday: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>
                Total: {data.historicalUsage.reduce((sum, d) => sum + d.totalRequests, 0)} requests
              </span>
              <span>
                {formatTokens(data.historicalUsage.reduce((sum, d) => sum + d.totalTokens, 0))} tokens
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {data.currentUsage.totalRequests === 0 && data.historicalUsage.length === 0 && (
        <div className="text-center py-6 text-gray-500">
          <Cpu size={32} className="mx-auto mb-2 opacity-50" />
          <p>No usage data yet. Start a search to see model activity here.</p>
        </div>
      )}
    </div>
  );
};

export default DashboardMonitor;
