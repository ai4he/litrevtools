import React, { useState, useEffect } from 'react';
import { SearchForm } from '../components/SearchForm';
import { ProgressDashboard } from '../components/ProgressDashboard';
import { PaperList } from '../components/PaperList';
import { OutputDownloads } from '../components/OutputDownloads';
import { useSocket } from '../hooks/useSocket';
import { useProgress } from '../hooks/useProgress';
import { searchAPI } from '../utils/api';
import { SearchParameters } from '../types';

export const SearchPage: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const { socket, isConnected } = useSocket();
  const { progress, papers, error, clearError } = useProgress(socket, sessionId);

  useEffect(() => {
    console.log('[SearchPage] State:', {
      sessionId,
      isSearching,
      isConnected,
      hasProgress: !!progress,
      progressStatus: progress?.status,
      papersCount: papers.length,
      error
    });
  }, [sessionId, isSearching, isConnected, progress, papers, error]);

  useEffect(() => {
    if (error) {
      alert(`Error: ${error}`);
      clearError();
    }
  }, [error]);

  const handleStartSearch = async (params: SearchParameters) => {
    try {
      setIsSearching(true);
      const response = await searchAPI.start(params);
      setSessionId(response.sessionId);
    } catch (err: any) {
      console.error('Failed to start search:', err);
      alert(err.response?.data?.message || 'Failed to start search');
      setIsSearching(false);
    }
  };

  const handlePause = async () => {
    if (!sessionId) return;
    try {
      await searchAPI.pause(sessionId);
    } catch (err: any) {
      console.error('Failed to pause search:', err);
      alert(err.response?.data?.message || 'Failed to pause search');
    }
  };

  const handleResume = async () => {
    if (!sessionId) return;
    try {
      await searchAPI.resume(sessionId);
    } catch (err: any) {
      console.error('Failed to resume search:', err);
      alert(err.response?.data?.message || 'Failed to resume search');
    }
  };

  const handleStop = async () => {
    if (!sessionId) return;
    if (!confirm('Are you sure you want to stop this search?')) return;

    try {
      await searchAPI.stop(sessionId);
      setIsSearching(false);
    } catch (err: any) {
      console.error('Failed to stop search:', err);
      alert(err.response?.data?.message || 'Failed to stop search');
    }
  };

  // Update searching state based on progress
  useEffect(() => {
    if (progress) {
      if (progress.status === 'completed' || progress.status === 'error') {
        setIsSearching(false);
      }
    }
  }, [progress]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">LitRevTools</h1>
          <p className="text-gray-600">
            AI-Powered Systematic Literature Review Tool with PRISMA Methodology
          </p>
          {!isConnected && (
            <div className="mt-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded inline-block text-sm">
              Connecting to server...
            </div>
          )}
        </div>

        {/* Search Form */}
        {!sessionId && (
          <div className="mb-8">
            <SearchForm onSubmit={handleStartSearch} disabled={isSearching} />
          </div>
        )}

        {/* Progress and Results */}
        {sessionId && progress && (
          <div className="space-y-8">
            {/* Progress Dashboard */}
            <ProgressDashboard
              progress={progress}
              onPause={handlePause}
              onResume={handleResume}
              onStop={handleStop}
            />

            {/* Output Downloads */}
            <OutputDownloads sessionId={sessionId} />

            {/* Papers List */}
            <PaperList papers={papers} />

            {/* Reset Button */}
            {(progress.status === 'completed' || progress.status === 'error') && (
              <div className="text-center">
                <button
                  onClick={() => {
                    setSessionId(null);
                    setIsSearching(false);
                  }}
                  className="btn-primary px-8 py-3 text-lg"
                >
                  Start New Search
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
