import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { Filter, Download, CheckCircle, AlertCircle, Play, Pause, Square } from 'lucide-react';
import { ProgressCard, BatchProgress } from './ProgressCard';
import { LiveLLMActivityMonitor } from './LiveLLMActivityMonitor';
import { downloadBlob } from '../utils/helpers';
import { sessionAPI } from '../utils/api';
import { useSocket } from '../hooks/useSocket';
import axios from 'axios';

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
  // Real-time status fields
  currentAction?: string;
  currentModel?: string;
  healthyKeysCount?: number;
  retryCount?: number;
  keyRotations?: number;
  modelFallbacks?: number;
  apiKeyQuotas?: Array<{
    label: string;
    status: string;
    quotaRemaining: number;
    quotaDetails: string;
    healthStatus?: string;
  }>;
  activeStreams?: Array<{
    requestId: string;
    keyLabel: string;
    modelName: string;
    paperId?: string;
    paperTitle?: string;
    tokensReceived: number;
    streamSpeed: number;
    startTime: number;
    status: 'streaming' | 'completing' | 'completed' | 'error';
  }>;
}

interface Step2SemanticFilteringProps {
  sessionId: string | null;
  enabled: boolean;
  onFilteringComplete: (sessionId: string, labeledCsvData: any[]) => void;
  /** Whether Step 2 was already completed (used to restore UI state after tab switch) */
  isComplete?: boolean;
}

export interface Step2SemanticFilteringRef {
  startFiltering: (inclusionPrompt?: string, exclusionPrompt?: string) => void;
}

export const Step2SemanticFiltering = forwardRef<Step2SemanticFilteringRef, Step2SemanticFilteringProps>(({
  sessionId,
  onFilteringComplete,
  isComplete: isCompleteProp = false
}, ref) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  // Initialize filteringCompleted from prop (handles tab switch restoration)
  const [filteringCompleted, setFilteringCompleted] = useState(isCompleteProp);
  const [progress, setProgress] = useState<SemanticFilteringProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useStep1Data, setUseStep1Data] = useState(true);
  const [inclusionPrompt, setInclusionPrompt] = useState(
    'The paper must have a scientific contribution by proposing a new approach that advance science, so papers that only implement the technology as use case are not allowed.'
  );
  const [exclusionPrompt, setExclusionPrompt] = useState(
    'Literature reviews of any kind are not allowed.'
  );
  const [batchSize, setBatchSize] = useState(20);
  const [llmModel, setLlmModel] = useState<'auto' | 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' | 'gemini-2.0-flash-exp'>('auto');
  const [csvSessionId, setCsvSessionId] = useState<string | null>(null);
  const [filteredPapers, setFilteredPapers] = useState<any[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const { socket, reconnectCount, resubscribe } = useSocket();
  const lastReconnectCount = useRef(0);

  // Use csvSessionId if available (for CSV upload), otherwise use sessionId from Step 1
  const activeSessionId = csvSessionId || sessionId;

  // Expose trigger method to parent via ref
  useImperativeHandle(ref, () => ({
    startFiltering: (customInclusionPrompt?: string, customExclusionPrompt?: string) => {
      // Automatically use Step 1 data when triggered via ref
      setUseStep1Data(true);
      // Update prompts if provided
      if (customInclusionPrompt) {
        setInclusionPrompt(customInclusionPrompt);
      }
      if (customExclusionPrompt) {
        setExclusionPrompt(customExclusionPrompt);
      }
      // Delay slightly to ensure state updates
      setTimeout(() => {
        handleStartFiltering();
      }, 100);
    }
  }));

  // Load papers when mounting with isCompleteProp=true (e.g., after tab switch)
  useEffect(() => {
    if (isCompleteProp && activeSessionId && filteredPapers.length === 0) {
      console.log('[Step2] Loading papers for completed step (tab switch restoration)');
      const loadPapers = async () => {
        try {
          const sessionResponse = await sessionAPI.getById(activeSessionId);
          if (sessionResponse.success && sessionResponse.session?.papers) {
            setFilteredPapers(sessionResponse.session.papers);
            console.log('[Step2] Loaded', sessionResponse.session.papers.length, 'papers for download');
          }
        } catch (e) {
          console.error('[Step2] Failed to load papers for completed step:', e);
        }
      };
      loadPapers();
    }
  }, [isCompleteProp, activeSessionId]);

  // Listen for semantic filter progress events via WebSocket
  useEffect(() => {
    if (!socket || !activeSessionId) {
      return;
    }

    console.log('[Step2] Setting up semantic-filter-progress listener for session:', activeSessionId);

    // Subscribe to session updates
    socket.emit('subscribe', activeSessionId);

    // Listen for progress
    const progressEvent = `semantic-filter-progress:${activeSessionId}`;
    const completeEvent = `semantic-filter-complete:${activeSessionId}`;

    const handleProgress = (progressData: SemanticFilteringProgress) => {
      setProgress(progressData);

      if (progressData.status === 'running') {
        setIsFiltering(true);
        setError(null);
      } else if (progressData.status === 'completed') {
        setIsFiltering(false);
        setFilteringCompleted(true);
        setProgress(null);
      } else if (progressData.status === 'error') {
        setIsFiltering(false);
        setError(progressData.error || 'Semantic filtering failed');
      }
    };

    const handleComplete = (data: any) => {
      console.log('[Step2] Filtering complete:', data);
      setIsFiltering(false);
      setFilteringCompleted(true);
      setProgress(null);
      const papers = data.papers || [];
      setFilteredPapers(papers);
      if (activeSessionId) {
        onFilteringComplete(activeSessionId, papers);
      }
    };

    socket.on(progressEvent, handleProgress);
    socket.on(completeEvent, handleComplete);

    return () => {
      console.log('[Step2] Cleaning up semantic-filter-progress listener');
      socket.off(progressEvent, handleProgress);
      socket.off(completeEvent, handleComplete);
      socket.emit('unsubscribe', activeSessionId);
    };
  }, [socket, activeSessionId, onFilteringComplete]);

  // Fetch initial status on mount or when sessionId changes
  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    console.log('[Step2] Fetching status for session:', activeSessionId, 'filteringCompleted:', filteringCompleted);

    const fetchInitialStatus = async () => {
      // Skip fetch if already completed - state persists while mounted
      if (filteringCompleted) {
        console.log('[Step2] Already completed, skipping status fetch');
        return;
      }

      try {
        const response = await sessionAPI.getStepStatus(activeSessionId);
        console.log('[Step2] Initial status response:', response);

        if (response.success && response.stepStatus) {
          const { stepStatus } = response;

          // Only update if this is Step 2 status
          if (stepStatus.step === 2) {
            if (stepStatus.status === 'running') {
              setIsFiltering(true);
              setFilteringCompleted(false);
              setProgress({
                status: 'running',
                currentTask: stepStatus.currentTask || 'Processing...',
                progress: stepStatus.progress || 0,
                phase: 'inclusion',
                totalPapers: 0,
                processedPapers: 0,
                currentBatch: 0,
                totalBatches: 0,
              });
            } else if (stepStatus.status === 'completed') {
              setIsFiltering(false);
              setFilteringCompleted(true);
              setProgress(null);
              // Also fetch papers for download
              try {
                const sessionResponse = await sessionAPI.getById(activeSessionId);
                if (sessionResponse.success && sessionResponse.session?.papers) {
                  setFilteredPapers(sessionResponse.session.papers);
                }
              } catch (e) {
                console.error('[Step2] Failed to fetch papers:', e);
              }
            } else if (stepStatus.status === 'error') {
              setIsFiltering(false);
              setError(stepStatus.error || 'Semantic filtering failed');
            }
          } else if (stepStatus.step === 3) {
            // Step 3 ran after Step 2 - check if papers have LLM filtering data
            try {
              const sessionResponse = await sessionAPI.getById(activeSessionId);
              if (sessionResponse.success && sessionResponse.session?.papers) {
                const papers = sessionResponse.session.papers;
                // Check if any paper has systematic_filtering_inclusion_reasoning (only set by LLM in Step 2)
                // This field is NOT set by Step 1's keyword-based filtering
                const hasLLMFilteringData = papers.some((p: any) =>
                  p.systematic_filtering_inclusion_reasoning && p.systematic_filtering_inclusion_reasoning.length > 0
                );
                if (hasLLMFilteringData) {
                  console.log('[Step2] Papers have LLM filtering reasoning - Step 2 was completed');
                  setIsFiltering(false);
                  setFilteringCompleted(true);
                  setProgress(null);
                  setFilteredPapers(papers);
                }
              }
            } catch (sessionErr) {
              console.error('[Step2] Failed to fetch session data:', sessionErr);
            }
          }
          // If stepStatus.step === 1, do nothing - Step 2 hasn't started yet
        }
      } catch (err) {
        console.error('[Step2] Failed to fetch initial status:', err);
      }
    };

    fetchInitialStatus();
  }, [activeSessionId, filteringCompleted]); // Re-run when sessionId changes or completion status changes

  // Sync status on reconnection
  useEffect(() => {
    // Skip initial render and only act on actual reconnections
    if (reconnectCount === 0 || reconnectCount === lastReconnectCount.current) {
      return;
    }
    lastReconnectCount.current = reconnectCount;

    if (!activeSessionId) {
      return;
    }

    console.log('[Step2] Reconnected! Syncing status for session:', activeSessionId);

    // Re-subscribe to session events
    resubscribe(activeSessionId);

    // Fetch current status from REST API
    const syncStatus = async () => {
      try {
        const response = await sessionAPI.getStepStatus(activeSessionId);
        console.log('[Step2] Reconnection status response:', response);

        if (response.success && response.stepStatus) {
          const { stepStatus } = response;

          // Only update if this is Step 2 status
          if (stepStatus.step === 2) {
            if (stepStatus.status === 'running') {
              setIsFiltering(true);
              setFilteringCompleted(false);
              setProgress({
                status: 'running',
                currentTask: stepStatus.currentTask || 'Processing...',
                progress: stepStatus.progress || 0,
                phase: 'inclusion',
                totalPapers: 0,
                processedPapers: 0,
                currentBatch: 0,
                totalBatches: 0,
              });
            } else if (stepStatus.status === 'completed') {
              setIsFiltering(false);
              setFilteringCompleted(true);
              setProgress(null);
            } else if (stepStatus.status === 'error') {
              setIsFiltering(false);
              setError(stepStatus.error || 'Semantic filtering failed');
            }
          }
        }
      } catch (err) {
        console.error('[Step2] Failed to sync status on reconnection:', err);
      }
    };

    syncStatus();
  }, [reconnectCount, activeSessionId, resubscribe]);

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
    if (!useStep1Data && !uploadedFile) {
      setError('Please select a data source (Step 1 results or upload CSV)');
      return;
    }

    if (useStep1Data && !sessionId) {
      setError('No session available. Please complete Step 1 first.');
      return;
    }

    try {
      setIsFiltering(true);
      setFilteringCompleted(false);
      setError(null);
      setProgress({
        status: 'running',
        currentTask: 'Starting semantic filtering...',
        progress: 0,
        phase: 'inclusion',
        totalPapers: 0,
        processedPapers: 0,
        currentBatch: 0,
        totalBatches: 0,
        timeElapsed: 0
      });

      // Call the real API endpoint
      if (useStep1Data && sessionId) {
        // Use Step 1 results
        await axios.post(`/api/sessions/${sessionId}/semantic-filter`, {
          inclusionPrompt,
          exclusionPrompt,
          batchSize,
          model: llmModel
        });
      } else if (uploadedFile) {
        // Handle CSV upload case
        console.log('[Step2] Reading CSV file:', uploadedFile.name);

        // Read CSV file content
        const csvContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('Failed to read CSV file'));
          reader.readAsText(uploadedFile);
        });

        console.log('[Step2] Sending CSV to API (length:', csvContent.length, 'chars)');

        // Send CSV to new endpoint
        const response = await axios.post('/api/semantic-filter/csv', {
          csvContent,
          inclusionPrompt,
          exclusionPrompt,
          batchSize,
          model: llmModel
        });

        // Set the temporary session ID returned from the server
        const tempSessionId = response.data.sessionId;
        console.log('[Step2] Received temp session ID:', tempSessionId);
        setCsvSessionId(tempSessionId);
      }

      // Progress will come via WebSocket
    } catch (err: any) {
      console.error('Semantic filtering failed:', err);
      setError(err.response?.data?.message || err.message || 'Failed to start semantic filtering');
      setIsFiltering(false);
      setProgress(null);
    }
  };

  const handleDownloadLabeledCsv = async () => {
    try {
      if (filteredPapers.length > 0) {
        // Download from local filtered papers state (works for both CSV upload and Step 1 data)
        console.log('[Step2] Downloading CSV from local state:', filteredPapers.length, 'papers');

        // Convert papers to CSV
        const headers = [
          'ID', 'Title', 'Authors', 'Year', 'Abstract', 'URL', 'Citations', 'DOI', 'Venue',
          'Systematic Filtering Inclusion', 'Systematic Filtering Inclusion Reasoning',
          'Systematic Filtering Exclusion', 'Systematic Filtering Exclusion Reasoning',
          'Included', 'Exclusion Reason'
        ];

        const rows = filteredPapers.map((paper: any) => [
          paper.id || '',
          paper.title || '',
          (paper.authors || []).join('; '),
          paper.year || '',
          paper.abstract || '',
          paper.url || '',
          paper.citations || '',
          paper.doi || '',
          paper.venue || '',
          paper.systematic_filtering_inclusion === true ? '1' : paper.systematic_filtering_inclusion === false ? '0' : '',
          paper.systematic_filtering_inclusion_reasoning || '',
          paper.systematic_filtering_exclusion === true ? '1' : paper.systematic_filtering_exclusion === false ? '0' : '',
          paper.systematic_filtering_exclusion_reasoning || '',
          paper.included ? 'Yes' : 'No',
          paper.exclusionReason || ''
        ]);

        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, 'papers-labeled.csv');
      } else if (sessionId) {
        // Fallback: try downloading from server (for backward compatibility or if filtering hasn't run)
        console.log('[Step2] Attempting to download CSV from server for session:', sessionId);
        const blob = await sessionAPI.download(sessionId, 'csv');
        downloadBlob(blob, 'papers-labeled.csv');
      } else {
        setError('No data available for download');
      }
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(err.response?.data?.message || err.message || 'Failed to download labeled CSV file');
    }
  };

  const handlePause = async () => {
    if (!activeSessionId) return;
    try {
      await sessionAPI.pauseSemanticFilter(activeSessionId);
      setIsPaused(true);
    } catch (err: any) {
      console.error('Failed to pause semantic filtering:', err);
      setError(err.response?.data?.message || 'Failed to pause semantic filtering');
    }
  };

  const handleResume = async () => {
    if (!activeSessionId) return;
    try {
      await sessionAPI.resumeSemanticFilter(activeSessionId);
      setIsPaused(false);
    } catch (err: any) {
      console.error('Failed to resume semantic filtering:', err);
      setError(err.response?.data?.message || 'Failed to resume semantic filtering');
    }
  };

  const handleStop = async () => {
    if (!activeSessionId) return;
    if (!confirm('Are you sure you want to stop semantic filtering?')) return;

    try {
      await sessionAPI.stopSemanticFilter(activeSessionId);
      setIsFiltering(false);
      setIsPaused(false);
    } catch (err: any) {
      console.error('Failed to stop semantic filtering:', err);
      setError(err.response?.data?.message || 'Failed to stop semantic filtering');
    }
  };

  // Consider complete if filteringCompleted flag is set OR if progress shows completed status
  const isComplete = filteringCompleted || progress?.status === 'completed';
  const hasError = progress?.status === 'error' || !!error;

  const batchProgress: BatchProgress | undefined = progress ? {
    currentBatch: progress.currentBatch,
    totalBatches: progress.totalBatches,
    itemsProcessed: progress.processedPapers,
    itemsRemaining: progress.totalPapers - progress.processedPapers
  } : undefined;

  // Step 2 is always enabled (can use CSV upload even without Step 1)
  const isEnabled = true;

  return (
    <div className="card">
      {/* Step Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isComplete ? 'bg-green-100 text-green-600' :
          hasError ? 'bg-red-100 text-red-600' :
          isFiltering ? 'bg-blue-100 text-blue-600' :
          'bg-yellow-100 text-yellow-600'
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
                  onChange={() => {
                    setUseStep1Data(true);
                    setUploadedFile(null);
                  }}
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
          <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-purple-600">🤖</span>
              AI-Powered Analysis (LLM)
            </h3>
            <p className="text-xs text-gray-600">
              API keys are automatically loaded from your .env file and rotate automatically when rate limits are reached.
            </p>

            {/* Model Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                LLM Model
              </label>
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value as any)}
                className="input-field w-full"
              >
                <option value="auto">🤖 Auto (Recommended - Automatically selects best model based on available quota)</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Fast & Efficient)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (More Capable)</option>
                <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Experimental (Legacy - Not Recommended)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {llmModel === 'auto' ? (
                  <>
                    <strong>Auto Mode:</strong> The system will automatically select the best model based on available API quota across all your keys.
                    This ensures maximum throughput and minimizes rate limit errors. The system will rotate between API keys and switch models as needed.
                  </>
                ) : (
                  <>
                    <strong>Manual Mode:</strong> Using {llmModel}. The system will stick to this model and only rotate API keys when rate limits are hit.
                    Switch to "Auto" mode for better quota management across all your API keys.
                  </>
                )}
              </p>
            </div>

            {/* Batch Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Batch Size (papers per batch)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(100, parseInt(e.target.value) || 20)))}
                className="input-field w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of papers to process in each batch. Larger batches = fewer API calls. Default: 20
              </p>
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
                className="input-field w-full resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Papers meeting this criteria will have systematic_filtering_inclusion = 1
              </p>
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
                className="input-field w-full resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Papers meeting this criteria will have systematic_filtering_exclusion = 1
              </p>
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartFiltering}
            disabled={!isEnabled || isFiltering}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Play size={18} />
            Start Semantic Filtering
          </button>
        </div>
      )}

      {/* Progress - only show if actively filtering AND not yet completed */}
      {progress && isFiltering && !filteringCompleted && (
        <div className="space-y-4">
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

          {/* Control Buttons */}
          <div className="flex gap-2 justify-center">
            {!isPaused ? (
              <button
                onClick={handlePause}
                className="btn-secondary flex items-center gap-2 px-4 py-2"
              >
                <Pause size={18} />
                Pause
              </button>
            ) : (
              <button
                onClick={handleResume}
                className="btn-primary flex items-center gap-2 px-4 py-2"
              >
                <Play size={18} />
                Resume
              </button>
            )}
            <button
              onClick={handleStop}
              className="btn-danger flex items-center gap-2 px-4 py-2"
            >
              <Square size={18} />
              Stop
            </button>
          </div>

          {/* Real-time Status Details */}
          {(progress.currentModel || progress.retryCount || progress.keyRotations || progress.modelFallbacks) && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-medium text-blue-900 mb-2">📊 Real-time Status</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {progress.currentModel && (
                  <div className="bg-white p-2 rounded shadow-sm">
                    <div className="text-gray-500 font-medium">Current Model</div>
                    <div className="text-gray-900 font-mono">{progress.currentModel}</div>
                  </div>
                )}
                {progress.healthyKeysCount !== undefined && (
                  <div className="bg-white p-2 rounded shadow-sm">
                    <div className="text-gray-500 font-medium">Healthy Keys</div>
                    <div className="text-green-600 font-bold text-lg">{progress.healthyKeysCount}</div>
                  </div>
                )}
                {progress.retryCount !== undefined && progress.retryCount > 0 && (
                  <div className="bg-white p-2 rounded shadow-sm">
                    <div className="text-gray-500 font-medium">Retries</div>
                    <div className="text-yellow-600 font-bold text-lg">{progress.retryCount}</div>
                  </div>
                )}
                {progress.keyRotations !== undefined && progress.keyRotations > 0 && (
                  <div className="bg-white p-2 rounded shadow-sm">
                    <div className="text-gray-500 font-medium">Key Rotations</div>
                    <div className="text-blue-600 font-bold text-lg">{progress.keyRotations}</div>
                  </div>
                )}
                {progress.modelFallbacks !== undefined && progress.modelFallbacks > 0 && (
                  <div className="bg-white p-2 rounded shadow-sm">
                    <div className="text-gray-500 font-medium">Model Fallbacks</div>
                    <div className="text-purple-600 font-bold text-lg">{progress.modelFallbacks}</div>
                  </div>
                )}
              </div>
              {progress.currentAction && progress.currentAction !== progress.currentTask && (
                <div className="mt-3 text-xs text-blue-800 bg-blue-100 px-3 py-2 rounded">
                  <span className="font-medium">Action:</span> {progress.currentAction}
                </div>
              )}
            </div>
          )}

          {/* Live LLM Activity Monitor - Shows active streams and API key quotas */}
          <LiveLLMActivityMonitor
            activeStreams={progress.activeStreams}
            apiKeyQuotas={progress.apiKeyQuotas}
            healthyKeysCount={progress.healthyKeysCount}
            currentModel={progress.currentModel}
          />
        </div>
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
});
