import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { FileText, Download, CheckCircle, AlertCircle, Play, Package, File, Pause, Square } from 'lucide-react';
import { ProgressCard, BatchProgress } from './ProgressCard';
import { LiveLLMActivityMonitor } from './LiveLLMActivityMonitor';
import { downloadBlob } from '../utils/helpers';
import { sessionAPI } from '../utils/api';
import { OutputProgress } from '../types';
import { useSocket } from '../hooks/useSocket';

interface Step3LatexGenerationProps {
  sessionId: string | null;
  enabled: boolean;
  onComplete?: (sessionId: string) => void;
}

export interface Step3LatexGenerationRef {
  startGeneration: () => void;
}

type OutputType = 'csv' | 'bibtex' | 'latex' | 'zip';

interface OutputFile {
  type: OutputType;
  label: string;
  description: string;
  icon: React.ReactNode;
  filename: string;
}

const OUTPUT_FILES: OutputFile[] = [
  {
    type: 'csv',
    label: 'CSV File',
    description: 'Paper data in CSV format',
    icon: <FileText size={20} />,
    filename: 'papers.csv',
  },
  {
    type: 'bibtex',
    label: 'BibTeX File',
    description: 'References in BibTeX format',
    icon: <File size={20} />,
    filename: 'references.bib',
  },
  {
    type: 'latex',
    label: 'LaTeX Paper',
    description: 'Research paper with PRISMA diagrams',
    icon: <File size={20} />,
    filename: 'paper.tex',
  },
  {
    type: 'zip',
    label: 'Complete Package',
    description: 'All files in a ZIP archive',
    icon: <Package size={20} />,
    filename: 'litreview.zip',
  },
];

export const Step3LatexGeneration = forwardRef<Step3LatexGenerationRef, Step3LatexGenerationProps>(({
  sessionId,
  onComplete
}, ref) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputProgress, setOutputProgress] = useState<OutputProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'step1' | 'step2' | 'upload'>('step2');
  const [latexPrompt, setLatexPrompt] = useState('');
  const [downloading, setDownloading] = useState<Set<OutputType>>(new Set());
  const [outputsGenerated, setOutputsGenerated] = useState(false);
  const [availableOutputs, setAvailableOutputs] = useState<Record<OutputType, boolean>>({
    csv: false,
    bibtex: false,
    latex: false,
    zip: false
  });
  const [llmModel, setLlmModel] = useState<'auto' | 'gemini-3-pro-preview' | 'gemini-2.5-flash-lite' | 'gemini-2.5-flash' | 'gemini-2.0-flash-exp'>('auto');
  const [batchSize, setBatchSize] = useState(30);
  const [tempSessionId, setTempSessionId] = useState<string | null>(null); // Store temp session ID from CSV upload
  const [isPaused, setIsPaused] = useState(false);
  const { socket, reconnectCount, resubscribe } = useSocket();
  const lastReconnectCount = useRef(0);

  // Use tempSessionId if available (CSV upload), otherwise use sessionId from props
  const activeSessionId = tempSessionId || sessionId;

  // Expose trigger method to parent via ref
  useImperativeHandle(ref, () => ({
    startGeneration: () => {
      // Automatically use Step 2 data when triggered via ref
      setDataSource('step2');
      handleStartGeneration();
    }
  }));

  // Listen for output progress events via WebSocket
  useEffect(() => {
    // Use tempSessionId if available (CSV upload), otherwise use sessionId from props
    const activeSessionId = tempSessionId || sessionId;

    console.log('[Step3 useEffect] ========== EFFECT TRIGGERED ==========');
    console.log('[Step3 useEffect] tempSessionId:', tempSessionId);
    console.log('[Step3 useEffect] sessionId (prop):', sessionId);
    console.log('[Step3 useEffect] activeSessionId:', activeSessionId);
    console.log('[Step3 useEffect] socket:', socket ? 'connected' : 'not connected');

    if (!socket || !activeSessionId) {
      console.log('[Step3 useEffect] Skipping setup - missing socket or sessionId');
      return;
    }

    console.log('[Step3 useEffect] Setting up WebSocket listeners for session:', activeSessionId);

    // Subscribe to session updates
    console.log('[Step3 useEffect] Emitting subscribe event for:', activeSessionId);
    socket.emit('subscribe', activeSessionId);

    // Listen for output progress
    const outputProgressEvent = `output-progress:${activeSessionId}`;
    const outputsEvent = `outputs:${activeSessionId}`;

    console.log('[Step3 useEffect] Registering listeners:');
    console.log('[Step3 useEffect]   - Event:', outputProgressEvent);
    console.log('[Step3 useEffect]   - Event:', outputsEvent);

    const handleOutputProgress = (progress: OutputProgress) => {
      console.log('[Step3 WebSocket] ========== OUTPUT PROGRESS RECEIVED ==========');
      console.log('[Step3 WebSocket] Progress:', {
        status: progress.status,
        stage: progress.stage,
        completedStages: progress.completedStages,
        totalStages: progress.totalStages,
        progress: progress.progress,
        currentTask: progress.currentTask
      });
      setOutputProgress(progress);

      if (progress.status === 'running') {
        console.log('[Step3 WebSocket] Status: RUNNING - setting isGenerating=true');
        setIsGenerating(true);
        setError(null);
      } else if (progress.status === 'completed') {
        console.log('[Step3 WebSocket] Status: COMPLETED - marking outputs as generated');
        setIsGenerating(false);
        setOutputProgress(null); // Clear progress when done
        setOutputsGenerated(true); // Mark outputs as generated
        // Notify parent of completion
        const activeSessionId = tempSessionId || sessionId;
        if (onComplete && activeSessionId) {
          onComplete(activeSessionId);
        }
      } else if (progress.status === 'error') {
        console.log('[Step3 WebSocket] Status: ERROR -', progress.error);
        setIsGenerating(false);
        setError(progress.error || 'Output generation failed');
      }
    };

    const handleOutputsGenerated = (data: any) => {
      console.log('[Step3 WebSocket] ========== OUTPUTS GENERATED ==========');
      console.log('[Step3 WebSocket] Outputs data:', data);

      // Extract actual session ID from output file paths
      // For CSV uploads, the files are stored under the actual session ID, not the temp ID
      if (data?.csv || data?.bibtex || data?.latex || data?.zip) {
        const samplePath = data.csv || data.bibtex || data.latex || data.zip;
        // Extract session ID from path like: data/outputs/SESSION_ID/file.ext
        const sessionIdMatch = samplePath.match(/data\/outputs\/([^\/]+)\//);
        if (sessionIdMatch && sessionIdMatch[1]) {
          const actualSessionId = sessionIdMatch[1];
          console.log('[Step3 WebSocket] Extracted actual session ID from path:', actualSessionId);

          // Update tempSessionId to the actual session ID for downloads
          if (tempSessionId && tempSessionId !== actualSessionId) {
            console.log('[Step3 WebSocket] Updating tempSessionId from', tempSessionId, 'to', actualSessionId);
            setTempSessionId(actualSessionId);
          }
        }
      }

      // Track which outputs are actually available
      setAvailableOutputs({
        csv: !!data?.csv,
        bibtex: !!data?.bibtex,
        latex: !!data?.latex,
        zip: !!data?.zip
      });
      console.log('[Step3 WebSocket] Available outputs:', {
        csv: !!data?.csv,
        bibtex: !!data?.bibtex,
        latex: !!data?.latex,
        zip: !!data?.zip
      });

      setIsGenerating(false);
      setOutputProgress(null);
      setOutputsGenerated(true); // Mark outputs as generated
      // Notify parent of completion
      const activeSessionId = tempSessionId || sessionId;
      if (onComplete && activeSessionId) {
        onComplete(activeSessionId);
      }
    };

    console.log('[Step3 useEffect] Attaching event listeners...');
    socket.on(outputProgressEvent, handleOutputProgress);
    socket.on(outputsEvent, handleOutputsGenerated);
    console.log('[Step3 useEffect] Event listeners attached successfully');

    return () => {
      console.log('[Step3 useEffect] ========== CLEANUP ==========');
      console.log('[Step3 useEffect] Removing listeners and unsubscribing from:', activeSessionId);
      socket.off(outputProgressEvent, handleOutputProgress);
      socket.off(outputsEvent, handleOutputsGenerated);
      socket.emit('unsubscribe', activeSessionId);
    };
  }, [socket, sessionId, tempSessionId]);

  // Fetch initial status on mount
  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    console.log('[Step3] Initial mount - fetching status for session:', activeSessionId);

    const fetchInitialStatus = async () => {
      try {
        const response = await sessionAPI.getStepStatus(activeSessionId);
        console.log('[Step3] Initial status response:', response);

        if (response.success && response.stepStatus) {
          const { stepStatus } = response;

          // Only update if this is Step 3 status
          if (stepStatus.step === 3) {
            if (stepStatus.status === 'running') {
              setIsGenerating(true);
              setOutputsGenerated(false);
              setOutputProgress({
                status: 'running',
                stage: 'latex',
                currentTask: stepStatus.currentTask || 'Processing...',
                totalStages: 5,
                completedStages: 0,
                progress: stepStatus.progress || 0,
              });
            } else if (stepStatus.status === 'completed') {
              setIsGenerating(false);
              setOutputsGenerated(true);
              setOutputProgress(null);
            } else if (stepStatus.status === 'error') {
              setIsGenerating(false);
              setError(stepStatus.error || 'Output generation failed');
            }
          }
        }
      } catch (err) {
        console.error('[Step3] Failed to fetch initial status:', err);
      }
    };

    fetchInitialStatus();
  }, [activeSessionId]); // Only run on sessionId change (including initial mount)

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

    console.log('[Step3] Reconnected! Syncing status for session:', activeSessionId);

    // Re-subscribe to session events
    resubscribe(activeSessionId);

    // Fetch current status from REST API
    const syncStatus = async () => {
      try {
        const response = await sessionAPI.getStepStatus(activeSessionId);
        console.log('[Step3] Reconnection status response:', response);

        if (response.success && response.stepStatus) {
          const { stepStatus } = response;

          // Only update if this is Step 3 status
          if (stepStatus.step === 3) {
            if (stepStatus.status === 'running') {
              setIsGenerating(true);
              setOutputsGenerated(false);
              setOutputProgress({
                status: 'running',
                stage: 'latex',
                currentTask: stepStatus.currentTask || 'Processing...',
                totalStages: 5,
                completedStages: 0,
                progress: stepStatus.progress || 0,
              });
            } else if (stepStatus.status === 'completed') {
              setIsGenerating(false);
              setOutputsGenerated(true);
              setOutputProgress(null);
            } else if (stepStatus.status === 'error') {
              setIsGenerating(false);
              setError(stepStatus.error || 'Output generation failed');
            }
          }
        }
      } catch (err) {
        console.error('[Step3] Failed to sync status on reconnection:', err);
      }
    };

    syncStatus();
  }, [reconnectCount, activeSessionId, resubscribe]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.csv')) {
      setUploadedFile(file);
      setDataSource('upload');
      setError(null);
    } else {
      setError('Please upload a valid CSV file');
    }
  };

  const handleStartGeneration = async () => {
    console.log('[Step3 Generation] ========== START GENERATION CLICKED ==========');
    console.log('[Step3 Generation] dataSource:', dataSource);
    console.log('[Step3 Generation] uploadedFile:', uploadedFile?.name);
    console.log('[Step3 Generation] sessionId:', sessionId);

    if (dataSource === 'upload' && !uploadedFile) {
      console.log('[Step3 Generation] ERROR: No file uploaded');
      setError('Please upload a CSV file');
      return;
    }

    if (!sessionId && dataSource !== 'upload') {
      console.log('[Step3 Generation] ERROR: No session available');
      setError('No session available. Please complete previous steps or upload a CSV file.');
      return;
    }

    // Clear temp session ID when using sessionId from props (not CSV upload)
    if (dataSource !== 'upload') {
      console.log('[Step3 Generation] Clearing temp session ID (using prop sessionId)');
      setTempSessionId(null);
    }

    try {
      console.log('[Step3 Generation] Setting isGenerating=true and initial progress');
      setIsGenerating(true);
      setError(null);
      setOutputProgress({
        status: 'running',
        stage: 'csv',
        currentTask: 'Starting output generation...',
        totalStages: 5,
        completedStages: 0,
        progress: 0
      });

      // Request generation - progress will come via WebSocket
      if (sessionId) {
        // Map dataSource - 'upload' is not supported yet, use 'current' as fallback
        const apiDataSource = dataSource === 'upload' ? 'current' : dataSource;
        await sessionAPI.generate(sessionId, apiDataSource, {
          model: llmModel,
          batchSize,
          latexPrompt: latexPrompt.trim() || undefined
        });
      } else if (uploadedFile) {
        // Handle CSV upload case
        console.log('[Step3 CSV Upload] ========== READING CSV FILE ==========');
        console.log('[Step3 CSV Upload] File name:', uploadedFile.name);
        console.log('[Step3 CSV Upload] File size:', uploadedFile.size, 'bytes');

        // Read CSV file content
        const csvContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            console.log('[Step3 CSV Upload] File read successfully');
            resolve(e.target?.result as string);
          };
          reader.onerror = () => {
            console.error('[Step3 CSV Upload] ERROR reading file');
            reject(new Error('Failed to read CSV file'));
          };
          reader.readAsText(uploadedFile);
        });

        console.log('[Step3 CSV Upload] CSV content length:', csvContent.length, 'chars');
        console.log('[Step3 CSV Upload] Sending POST request to /api/generate/csv');
        console.log('[Step3 CSV Upload] Request params:', {
          csvLength: csvContent.length,
          model: llmModel,
          batchSize,
          hasLatexPrompt: !!latexPrompt?.trim()
        });

        // Import axios for this specific call
        const axios = (await import('axios')).default;

        // Send CSV to new endpoint
        const response = await axios.post('/api/generate/csv', {
          csvContent,
          model: llmModel,
          batchSize,
          latexPrompt: latexPrompt.trim() || undefined
        });

        console.log('[Step3 CSV Upload] ========== API RESPONSE RECEIVED ==========');
        console.log('[Step3 CSV Upload] Response:', response.data);

        // Set the temporary session ID returned from the server
        const newTempSessionId = response.data.sessionId;
        console.log('[Step3 CSV Upload] Temp session ID:', newTempSessionId);
        console.log('[Step3 CSV Upload] Setting tempSessionId state to trigger useEffect...');

        // Store temp session ID in state so useEffect can listen to it
        setTempSessionId(newTempSessionId);

        console.log('[Step3 CSV Upload] tempSessionId state updated - useEffect should trigger now');
        // The useEffect will automatically subscribe when tempSessionId changes
        // No need to manually subscribe here
      } else {
        throw new Error('No session or CSV file available');
      }
    } catch (err: any) {
      console.error('Generation failed:', err);
      setError(err.response?.data?.message || 'Failed to start output generation');
      setIsGenerating(false);
      setOutputProgress(null);
    }
  };

  const handleDownload = async (type: OutputType, filename: string) => {
    // Use active session ID (tempSessionId for CSV upload, sessionId for regular flow)
    const activeSessionId = tempSessionId || sessionId;
    if (!activeSessionId) return;

    console.log('[Step3 Download] Downloading', type, 'for session:', activeSessionId);

    try {
      setDownloading((prev) => new Set(prev).add(type));
      setError(null);

      const blob = await sessionAPI.download(activeSessionId, type);
      downloadBlob(blob, filename);
    } catch (err: any) {
      console.error('Download failed:', err);
      setError(err.response?.data?.message || `Failed to download ${type} file`);
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    }
  };

  const handlePause = async () => {
    const activeSessionId = tempSessionId || sessionId;
    if (!activeSessionId) return;
    try {
      await sessionAPI.pauseGenerate(activeSessionId);
      setIsPaused(true);
    } catch (err: any) {
      console.error('Failed to pause output generation:', err);
      setError(err.response?.data?.message || 'Failed to pause output generation');
    }
  };

  const handleResume = async () => {
    const activeSessionId = tempSessionId || sessionId;
    if (!activeSessionId) return;
    try {
      await sessionAPI.resumeGenerate(activeSessionId);
      setIsPaused(false);
    } catch (err: any) {
      console.error('Failed to resume output generation:', err);
      setError(err.response?.data?.message || 'Failed to resume output generation');
    }
  };

  const handleStop = async () => {
    const activeSessionId = tempSessionId || sessionId;
    if (!activeSessionId) return;
    if (!confirm('Are you sure you want to stop output generation?')) return;

    try {
      await sessionAPI.stopGenerate(activeSessionId);
      setIsGenerating(false);
      setIsPaused(false);
    } catch (err: any) {
      console.error('Failed to stop output generation:', err);
      setError(err.response?.data?.message || 'Failed to stop output generation');
    }
  };

  const isComplete = outputsGenerated && !isGenerating;
  const hasError = outputProgress?.status === 'error' || !!error;

  const batchProgress: BatchProgress | undefined = outputProgress?.latexBatchProgress ? {
    currentBatch: outputProgress.latexBatchProgress.currentBatch,
    totalBatches: outputProgress.latexBatchProgress.totalBatches,
    itemsProcessed: outputProgress.latexBatchProgress.papersProcessed || 0,
    itemsRemaining: outputProgress.latexBatchProgress.papersRemaining || 0,
    currentSize: outputProgress.latexBatchProgress.currentDocumentSize,
    estimatedFinalSize: outputProgress.latexBatchProgress.estimatedFinalSize
  } : undefined;

  // Step 3 is always enabled (can use CSV upload even without previous steps)
  return (
    <div className="card">
      {/* Step Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isComplete && !isGenerating ? 'bg-green-100 text-green-600' :
          hasError ? 'bg-red-100 text-red-600' :
          isGenerating ? 'bg-blue-100 text-blue-600' :
          'bg-yellow-100 text-yellow-600'
        }`}>
          {isComplete && !isGenerating ? <CheckCircle size={24} /> :
           hasError ? <AlertCircle size={24} /> :
           <FileText size={24} />}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Step 3: LaTeX Paper Generation</h2>
          <p className="text-sm text-gray-600">
            Generate complete LaTeX paper with PRISMA methodology and all outputs
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Configuration */}
      {!isGenerating && !outputsGenerated && (
        <div className="space-y-6">
          {/* Data Source Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Data Source
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={dataSource === 'step1'}
                  onChange={() => setDataSource('step1')}
                  disabled={!sessionId}
                  className="w-4 h-4"
                />
                <span className="text-sm">Use results from Step 1 (Raw data) {sessionId ? '(Available)' : '(Not available)'}</span>
              </label>
              <label className="flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={dataSource === 'step2'}
                  onChange={() => setDataSource('step2')}
                  disabled={!sessionId}
                  className="w-4 h-4"
                />
                <span className="text-sm">Use results from Step 2 (Labeled data) {sessionId ? '(Recommended)' : '(Not available)'}</span>
              </label>
              <label className="flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  checked={dataSource === 'upload'}
                  onChange={() => setDataSource('upload')}
                  className="w-4 h-4"
                />
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm">Upload CSV file</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="text-sm"
                    disabled={dataSource !== 'upload'}
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
                <option value="gemini-3-pro-preview">Gemini 3 Pro Preview (Top Quality - Best for LaTeX)</option>
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
                max="50"
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(50, parseInt(e.target.value) || 15)))}
                className="input-field w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of papers to include in each iterative generation batch. Default: 15
              </p>
            </div>

            {/* LaTeX Generation Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional LaTeX Generation Prompt (Optional)
              </label>
              <textarea
                value={latexPrompt}
                onChange={(e) => setLatexPrompt(e.target.value)}
                rows={3}
                placeholder="Additional instructions for LaTeX paper generation..."
                className="input-field w-full resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional instructions to customize the generated LaTeX paper
              </p>
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStartGeneration}
            disabled={isGenerating || (dataSource !== 'upload' && !sessionId) || (dataSource === 'upload' && !uploadedFile)}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Play size={18} />
            Generate All Outputs
          </button>
        </div>
      )}

      {/* Progress */}
      {outputProgress && isGenerating && (
        <>
          <ProgressCard
            title="Output Generation in Progress"
            currentTask={outputProgress.currentTask}
            progress={outputProgress.progress}
            stage={outputProgress.stage}
            currentStage={outputProgress.completedStages}
            totalStages={outputProgress.totalStages}
            timeElapsed={outputProgress.timeElapsed}
            estimatedTimeRemaining={outputProgress.estimatedTimeRemaining}
            batchProgress={batchProgress}
            error={outputProgress.error}
          />

          {/* Control Buttons */}
          <div className="flex gap-2 justify-center mt-4">
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

          {/* Activity Blocks - Real-time Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Previous Activity */}
            <div className="p-4 rounded-lg border-2 border-purple-200 bg-purple-50">
              <div className="text-xs font-semibold text-purple-700 uppercase mb-2">
                Previous Activity
              </div>
              <div className="text-sm text-purple-900">
                {outputProgress.previousActivity || 'Starting process...'}
              </div>
            </div>

            {/* Current Activity */}
            <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50">
              <div className="text-xs font-semibold text-blue-700 uppercase mb-2">
                Current Activity
              </div>
              <div className="text-sm text-blue-900 font-medium">
                {outputProgress.currentAction || outputProgress.currentTask}
              </div>
            </div>
          </div>

          {/* Real-time LLM Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {/* Model Information */}
            {outputProgress.currentModel && (
              <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <div className="text-xs font-semibold text-gray-600 uppercase mb-1">
                  Current Model
                </div>
                <div className="text-sm text-gray-900 font-mono">
                  {outputProgress.currentModel}
                </div>
                {outputProgress.modelFallbacks !== undefined && outputProgress.modelFallbacks > 0 && (
                  <div className="text-xs text-orange-600 mt-1">
                    ⚠️ {outputProgress.modelFallbacks} model switch{outputProgress.modelFallbacks > 1 ? 'es' : ''}
                  </div>
                )}
              </div>
            )}

            {/* Healthy Keys Count */}
            {outputProgress.healthyKeysCount !== undefined && (
              <div className="p-3 rounded-lg border border-green-200 bg-green-50">
                <div className="text-xs font-semibold text-green-700 uppercase mb-1">
                  Healthy API Keys
                </div>
                <div className="text-2xl font-bold text-green-600">
                  {outputProgress.healthyKeysCount}
                </div>
                <div className="text-xs text-green-600 mt-1">
                  ✓ Ready to process
                </div>
              </div>
            )}

            {/* API Key Status */}
            {outputProgress.currentApiKey && (
              <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <div className="text-xs font-semibold text-gray-600 uppercase mb-1">
                  API Key Status
                </div>
                <div className="text-sm text-gray-900">
                  Key {outputProgress.currentApiKey.index + 1} of {outputProgress.currentApiKey.total}
                </div>
                {outputProgress.currentApiKey.switches > 0 && (
                  <div className="text-xs text-blue-600 mt-1">
                    🔄 {outputProgress.currentApiKey.switches} key rotation{outputProgress.currentApiKey.switches > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}

            {/* Token Streaming */}
            {outputProgress.tokenStreaming?.enabled && (
              <div className="p-3 rounded-lg border border-green-200 bg-green-50">
                <div className="text-xs font-semibold text-green-700 uppercase mb-1">
                  Token Streaming
                </div>
                <div className="text-sm text-green-900">
                  {outputProgress.tokenStreaming.tokensReceived.toLocaleString()} tokens
                </div>
                {outputProgress.tokenStreaming.streamingSpeed && (
                  <div className="text-xs text-green-600 mt-1">
                    ⚡ {Math.round(outputProgress.tokenStreaming.streamingSpeed)} tokens/sec
                  </div>
                )}
              </div>
            )}

            {/* Waiting State */}
            {outputProgress.isWaiting && (
              <div className="p-3 rounded-lg border border-yellow-200 bg-yellow-50">
                <div className="text-xs font-semibold text-yellow-700 uppercase mb-1">
                  Waiting
                </div>
                <div className="text-sm text-yellow-900">
                  {outputProgress.waitReason || 'Please wait...'}
                </div>
              </div>
            )}

            {/* Fixing Output */}
            {outputProgress.isFixingOutput && (
              <div className="p-3 rounded-lg border border-orange-200 bg-orange-50">
                <div className="text-xs font-semibold text-orange-700 uppercase mb-1">
                  Processing
                </div>
                <div className="text-sm text-orange-900">
                  Fixing LaTeX syntax errors
                </div>
              </div>
            )}
          </div>

          {/* Live LLM Activity Monitor - Shows active streams and API key quotas */}
          <LiveLLMActivityMonitor
            activeStreams={outputProgress.activeStreams}
            apiKeyQuotas={outputProgress.apiKeyQuotas}
            healthyKeysCount={outputProgress.healthyKeysCount}
            currentModel={outputProgress.currentModel}
          />
        </>
      )}

      {/* Download Buttons */}
      {outputsGenerated && !isGenerating && (sessionId || tempSessionId) && (
        <div className="space-y-4">
          <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
            <h4 className="font-semibold text-green-900 mb-2">Outputs Generated!</h4>
            <p className="text-sm text-green-700">
              Your literature review outputs are ready. Download individual files or the complete package below.
            </p>
          </div>

          {/* Warning if LaTeX failed */}
          {!availableOutputs.latex && (
            <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                <AlertCircle size={20} />
                LaTeX Generation Failed
              </h4>
              <p className="text-sm text-yellow-700 mb-2">
                The LaTeX paper could not be generated due to JSON parsing errors from the AI service. This is a known issue when processing large paper sets.
              </p>
              <p className="text-sm text-yellow-700">
                Other outputs (CSV, BibTeX, PRISMA, ZIP) are available for download. You can still use the CSV and BibTeX files for your literature review.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {OUTPUT_FILES.map((file) => {
              const isDownloading = downloading.has(file.type);
              const isAvailable = availableOutputs[file.type];
              const isDisabled = isDownloading || !isAvailable;

              return (
                <button
                  key={file.type}
                  onClick={() => isAvailable && handleDownload(file.type, file.filename)}
                  disabled={isDisabled}
                  className={`flex items-center gap-4 p-4 border-2 rounded-lg transition-all text-left ${
                    isAvailable
                      ? 'border-gray-200 hover:border-primary-500 hover:bg-primary-50'
                      : 'border-gray-100 bg-gray-50 cursor-not-allowed'
                  } ${isDisabled ? 'opacity-50' : ''}`}
                >
                  <div className={`flex-shrink-0 p-3 rounded-lg ${
                    isAvailable ? 'bg-primary-100 text-primary-600' : 'bg-gray-200 text-gray-400'
                  }`}>
                    {file.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-semibold ${isAvailable ? 'text-gray-900' : 'text-gray-400'}`}>
                      {file.label}
                      {!isAvailable && <span className="ml-2 text-xs">(Not Available)</span>}
                    </h4>
                    <p className={`text-sm ${isAvailable ? 'text-gray-500' : 'text-gray-400'}`}>
                      {file.description}
                    </p>
                  </div>
                  {isAvailable && <Download className="text-gray-400" size={20} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
