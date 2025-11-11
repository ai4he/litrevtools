import React, { useState, useEffect } from 'react';
import { Search, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { SearchForm } from './SearchForm';
import { ProgressDashboard } from './ProgressDashboard';
import { PaperList } from './PaperList';
import { searchAPI, sessionAPI } from '../utils/api';
import { downloadBlob } from '../utils/helpers';
import { SearchParameters } from '../types';
import { useSocket } from '../hooks/useSocket';
import { useProgress } from '../hooks/useProgress';

interface Step1SearchProps {
  onSearchComplete: (sessionId: string, rawCsvData: any[]) => void;
  disabled?: boolean;
}

export const Step1Search: React.FC<Step1SearchProps> = ({ onSearchComplete, disabled }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [searchParameters, setSearchParameters] = useState<SearchParameters | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useSocket();
  const { progress, papers, error: progressError, clearError } = useProgress(socket, sessionId);

  // Handle progress errors
  useEffect(() => {
    if (progressError) {
      setError(progressError);
      clearError();
    }
  }, [progressError]);

  const handleStartSearch = async (params: SearchParameters) => {
    try {
      setIsSearching(true);
      setError(null);
      setSearchParameters(params);
      const response = await searchAPI.start(params);
      setSessionId(response.sessionId);
    } catch (err: any) {
      console.error('Failed to start search:', err);
      setError(err.response?.data?.message || 'Failed to start search');
      setIsSearching(false);
    }
  };

  const handlePause = async () => {
    if (!sessionId) return;
    try {
      await searchAPI.pause(sessionId);
    } catch (err: any) {
      console.error('Failed to pause search:', err);
      setError(err.response?.data?.message || 'Failed to pause search');
    }
  };

  const handleResume = async () => {
    if (!sessionId) return;
    try {
      await searchAPI.resume(sessionId);
    } catch (err: any) {
      console.error('Failed to resume search:', err);
      setError(err.response?.data?.message || 'Failed to resume search');
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
      setError(err.response?.data?.message || 'Failed to stop search');
    }
  };

  const handleDownloadRawCsv = async () => {
    if (!sessionId) return;
    try {
      const blob = await sessionAPI.download(sessionId, 'csv');
      downloadBlob(blob, 'papers-raw.csv');
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(err.response?.data?.message || 'Failed to download CSV file');
    }
  };

  const handleReset = () => {
    setSessionId(null);
    setSearchParameters(null);
    setIsSearching(false);
    setError(null);
  };

  // Update searching state based on progress
  useEffect(() => {
    if (progress) {
      if (progress.status === 'completed') {
        setIsSearching(false);
        // Notify parent that search is complete
        if (sessionId) {
          onSearchComplete(sessionId, papers);
        }
      } else if (progress.status === 'error') {
        setIsSearching(false);
      }
    }
  }, [progress, sessionId, papers]);

  const isComplete = progress?.status === 'completed';
  const hasError = progress?.status === 'error';

  return (
    <div className="card">
      {/* Step Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isComplete ? 'bg-green-100 text-green-600' :
          hasError ? 'bg-red-100 text-red-600' :
          isSearching ? 'bg-blue-100 text-blue-600' :
          'bg-gray-100 text-gray-400'
        }`}>
          {isComplete ? <CheckCircle size={24} /> :
           hasError ? <AlertCircle size={24} /> :
           <Search size={24} />}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Step 1: Search & Raw Data Extraction</h2>
          <p className="text-sm text-gray-600">
            Search Semantic Scholar and extract papers with keyword filtering
          </p>
        </div>
        {isComplete && (
          <button
            onClick={handleReset}
            className="btn-secondary text-sm px-4 py-2"
          >
            Start New Search
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Search Form */}
      {!sessionId && (
        <div className="mb-6">
          <SearchForm onSubmit={handleStartSearch} disabled={disabled || isSearching} />
        </div>
      )}

      {/* Progress and Results */}
      {sessionId && progress && (
        <div className="space-y-6">
          {/* Progress Dashboard */}
          <ProgressDashboard
            progress={progress}
            sessionId={sessionId}
            searchParameters={searchParameters || undefined}
            papers={papers}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStop}
          />

          {/* Download Raw CSV Button */}
          {isComplete && (
            <div className="flex items-center gap-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
              <div className="flex-1">
                <h4 className="font-semibold text-green-900">Raw Data Ready</h4>
                <p className="text-sm text-green-700">
                  Search complete! Download the raw CSV with keyword filtering or proceed to Step 2 for semantic filtering.
                </p>
              </div>
              <button
                onClick={handleDownloadRawCsv}
                className="btn-primary flex items-center gap-2"
              >
                <Download size={18} />
                Download Raw CSV
              </button>
            </div>
          )}

          {/* Papers List */}
          <PaperList papers={papers} />
        </div>
      )}
    </div>
  );
};
