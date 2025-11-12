import React, { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle, AlertCircle, Play, Package, File } from 'lucide-react';
import { ProgressCard, BatchProgress } from './ProgressCard';
import { downloadBlob } from '../utils/helpers';
import { sessionAPI } from '../utils/api';
import { OutputProgress } from '../types';
import { useSocket } from '../hooks/useSocket';

interface Step3LatexGenerationProps {
  sessionId: string | null;
  enabled: boolean;
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

export const Step3LatexGeneration: React.FC<Step3LatexGenerationProps> = ({
  sessionId
}) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputProgress, setOutputProgress] = useState<OutputProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'step1' | 'step2' | 'upload'>('step2');
  const [latexPrompt, setLatexPrompt] = useState('');
  const [downloading, setDownloading] = useState<Set<OutputType>>(new Set());
  const [outputsGenerated, setOutputsGenerated] = useState(false);
  const { socket } = useSocket();

  // Listen for output progress events via WebSocket
  useEffect(() => {
    if (!socket || !sessionId) {
      return;
    }

    console.log('[Step3] Setting up output-progress listener for session:', sessionId);

    // Subscribe to session updates
    socket.emit('subscribe', sessionId);

    // Listen for output progress
    const outputProgressEvent = `output-progress:${sessionId}`;
    const outputsEvent = `outputs:${sessionId}`;

    const handleOutputProgress = (progress: OutputProgress) => {
      console.log('[Step3] Received output progress:', progress);
      setOutputProgress(progress);

      if (progress.status === 'running') {
        setIsGenerating(true);
        setError(null);
      } else if (progress.status === 'completed') {
        setIsGenerating(false);
        setOutputProgress(null); // Clear progress when done
        setOutputsGenerated(true); // Mark outputs as generated
      } else if (progress.status === 'error') {
        setIsGenerating(false);
        setError(progress.error || 'Output generation failed');
      }
    };

    const handleOutputsGenerated = (data: any) => {
      console.log('[Step3] Outputs generated:', data);
      setIsGenerating(false);
      setOutputProgress(null);
      setOutputsGenerated(true); // Mark outputs as generated
    };

    socket.on(outputProgressEvent, handleOutputProgress);
    socket.on(outputsEvent, handleOutputsGenerated);

    return () => {
      console.log('[Step3] Cleaning up output-progress listener');
      socket.off(outputProgressEvent, handleOutputProgress);
      socket.off(outputsEvent, handleOutputsGenerated);
      socket.emit('unsubscribe', sessionId);
    };
  }, [socket, sessionId]);

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
    if (dataSource === 'upload' && !uploadedFile) {
      setError('Please upload a CSV file');
      return;
    }

    if (!sessionId && dataSource !== 'upload') {
      setError('No session available. Please complete previous steps or upload a CSV file.');
      return;
    }

    try {
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
        await sessionAPI.generate(sessionId, apiDataSource);
      } else {
        // TODO: Handle CSV upload case
        throw new Error('CSV upload not yet implemented');
      }
    } catch (err: any) {
      console.error('Generation failed:', err);
      setError(err.response?.data?.message || 'Failed to start output generation');
      setIsGenerating(false);
      setOutputProgress(null);
    }
  };

  const handleDownload = async (type: OutputType, filename: string) => {
    if (!sessionId) return;

    try {
      setDownloading((prev) => new Set(prev).add(type));
      setError(null);

      const blob = await sessionAPI.download(sessionId, type);
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

          {/* LaTeX Generation Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              LaTeX Generation Prompt (Optional)
            </label>
            <textarea
              value={latexPrompt}
              onChange={(e) => setLatexPrompt(e.target.value)}
              rows={3}
              placeholder="Additional instructions for LaTeX paper generation..."
              className="input w-full"
            />
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
      )}

      {/* Download Buttons */}
      {outputsGenerated && !isGenerating && sessionId && (
        <div className="space-y-4">
          <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
            <h4 className="font-semibold text-green-900 mb-2">All Outputs Generated Successfully!</h4>
            <p className="text-sm text-green-700">
              Your literature review is complete. Download individual files or the complete package below.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {OUTPUT_FILES.map((file) => {
              const isDownloading = downloading.has(file.type);
              return (
                <button
                  key={file.type}
                  onClick={() => handleDownload(file.type, file.filename)}
                  disabled={isDownloading}
                  className="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex-shrink-0 p-3 bg-primary-100 text-primary-600 rounded-lg">
                    {file.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{file.label}</h4>
                    <p className="text-sm text-gray-500">{file.description}</p>
                  </div>
                  <Download className="text-gray-400" size={20} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
