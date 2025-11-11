import React, { useState } from 'react';
import { Filter, Download, CheckCircle, AlertCircle, Play } from 'lucide-react';
import { ProgressCard, BatchProgress } from './ProgressCard';
import { downloadBlob } from '../utils/helpers';
import { sessionAPI } from '../utils/api';

interface SemanticFilteringProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  currentTask: string;
  progress: number;
  phase: 'inclusion' | 'exclusion' | 'finalizing';
  totalPapers: number;
  processedPapers: number;
  currentBatch: number;
  totalBatches: number;
  timeElapsed?: number;
  estimatedTimeRemaining?: number;
  error?: string;
}

interface Step2SemanticFilteringProps {
  sessionId: string | null;
  enabled: boolean;
  onFilteringComplete: (sessionId: string, labeledCsvData: any[]) => void;
}

export const Step2SemanticFiltering: React.FC<Step2SemanticFilteringProps> = ({
  sessionId,
  enabled,
  onFilteringComplete
}) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const [progress, setProgress] = useState<SemanticFilteringProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useStep1Data, setUseStep1Data] = useState(true);
  const [inclusionPrompt, setInclusionPrompt] = useState(
    'The paper must have a scientific contribution by proposing a new approach that advance science, so papers that only implement the technology as use case are not allowed.'
  );
  const [exclusionPrompt, setExclusionPrompt] = useState(
    'Literature reviews of any kind are not allowed.'
  );
  const [apiKey, setApiKey] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      setUploadedFile(file);
      setUseStep1Data(false);
      setError(null);
    } else {
      setError('Please upload a valid CSV file');
    }
  };

  const handleStartFiltering = async () => {
    if (!enabled) {
      setError('Please complete Step 1 or upload a CSV file first');
      return;
    }

    if (!apiKey.trim()) {
      setError('Please provide a Gemini API key');
      return;
    }

    if (!useStep1Data && !uploadedFile) {
      setError('Please select a data source (Step 1 results or upload CSV)');
      return;
    }

    try {
      setIsFiltering(true);
      setError(null);

      // TODO: Call API endpoint for semantic filtering
      // For now, simulate progress
      setProgress({
        status: 'running',
        currentTask: 'Starting semantic filtering...',
        progress: 0,
        phase: 'inclusion',
        totalPapers: 100,
        processedPapers: 0,
        currentBatch: 1,
        totalBatches: 5,
        timeElapsed: 0
      });

      // Simulate completion after 3 seconds
      setTimeout(() => {
        setProgress({
          status: 'completed',
          currentTask: 'Semantic filtering complete!',
          progress: 100,
          phase: 'finalizing',
          totalPapers: 100,
          processedPapers: 100,
          currentBatch: 5,
          totalBatches: 5
        });
        setIsFiltering(false);
        if (sessionId) {
          onFilteringComplete(sessionId, []);
        }
      }, 3000);
    } catch (err: any) {
      console.error('Semantic filtering failed:', err);
      setError(err.response?.data?.message || 'Failed to start semantic filtering');
      setIsFiltering(false);
    }
  };

  const handleDownloadLabeledCsv = async () => {
    if (!sessionId) return;
    try {
      const blob = await sessionAPI.download(sessionId, 'csv');
      downloadBlob(blob, 'papers-labeled.csv');
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(err.response?.data?.message || 'Failed to download labeled CSV file');
    }
  };

  const isComplete = progress?.status === 'completed';
  const hasError = progress?.status === 'error' || !!error;

  const batchProgress: BatchProgress | undefined = progress ? {
    currentBatch: progress.currentBatch,
    totalBatches: progress.totalBatches,
    itemsProcessed: progress.processedPapers,
    itemsRemaining: progress.totalPapers - progress.processedPapers
  } : undefined;

  return (
    <div className={`card ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Step Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isComplete ? 'bg-green-100 text-green-600' :
          hasError ? 'bg-red-100 text-red-600' :
          isFiltering ? 'bg-blue-100 text-blue-600' :
          enabled ? 'bg-yellow-100 text-yellow-600' :
          'bg-gray-100 text-gray-400'
        }`}>
          {isComplete ? <CheckCircle size={24} /> :
           hasError ? <AlertCircle size={24} /> :
           <Filter size={24} />}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Step 2: Semantic Filtering</h2>
          <p className="text-sm text-gray-600">
            Apply LLM-based semantic filtering with inclusion and exclusion criteria
          </p>
        </div>
        {!enabled && (
          <span className="px-3 py-1 bg-gray-200 text-gray-600 text-sm rounded-full">
            Locked
          </span>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Data Source Selection */}
      {!isFiltering && !isComplete && (
        <div className="space-y-6">
          {/* Source Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Source
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={useStep1Data}
                  onChange={() => setUseStep1Data(true)}
                  disabled={!sessionId}
                  className="w-4 h-4"
                />
                <span className="text-sm">Use results from Step 1 {sessionId ? '(Available)' : '(Not available)'}</span>
              </label>
              <label className="flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={!useStep1Data}
                  onChange={() => setUseStep1Data(false)}
                  className="w-4 h-4"
                />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm">Upload CSV file</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="text-sm"
                    disabled={useStep1Data}
                  />
                </div>
              </label>
            </div>
            {uploadedFile && (
              <p className="mt-2 text-sm text-green-600">
                ✓ File uploaded: {uploadedFile.name}
              </p>
            )}
          </div>

          {/* LLM Configuration */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">LLM Configuration</h3>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Gemini API Key *
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Gemini API key"
                className="input w-full"
              />
            </div>

            {/* Inclusion Criteria */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Inclusion Criteria Prompt
              </label>
              <textarea
                value={inclusionPrompt}
                onChange={(e) => setInclusionPrompt(e.target.value)}
                rows={3}
                className="input w-full"
              />
            </div>

            {/* Exclusion Criteria */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Exclusion Criteria Prompt
              </label>
              <textarea
                value={exclusionPrompt}
                onChange={(e) => setExclusionPrompt(e.target.value)}
                rows={3}
                className="input w-full"
              />
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartFiltering}
            disabled={!enabled || isFiltering}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Play size={18} />
            Start Semantic Filtering
          </button>
        </div>
      )}

      {/* Progress */}
      {progress && isFiltering && (
        <ProgressCard
          title="Semantic Filtering in Progress"
          currentTask={progress.currentTask}
          progress={progress.progress}
          stage={progress.phase}
          timeElapsed={progress.timeElapsed}
          estimatedTimeRemaining={progress.estimatedTimeRemaining}
          batchProgress={batchProgress}
          error={progress.error}
        />
      )}

      {/* Completion */}
      {isComplete && (
        <div className="flex items-center gap-4 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
          <div className="flex-1">
            <h4 className="font-semibold text-green-900">Semantic Filtering Complete</h4>
            <p className="text-sm text-green-700">
              Papers have been labeled with LLM-based inclusion/exclusion decisions. Download the labeled CSV or proceed to Step 3.
            </p>
          </div>
          <button
            onClick={handleDownloadLabeledCsv}
            className="btn-primary flex items-center gap-2"
          >
            <Download size={18} />
            Download Labeled CSV
          </button>
        </div>
      )}
    </div>
  );
};
