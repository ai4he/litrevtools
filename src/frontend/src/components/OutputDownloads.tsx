import React, { useState, useEffect } from 'react';
import { Download, FileText, File, Package, Loader2 } from 'lucide-react';
import { sessionAPI } from '../utils/api';
import { downloadBlob, formatTime } from '../utils/helpers';
import { useSocket } from '../hooks/useSocket';
import { OutputProgress } from '../types';

// Helper function to format bytes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

interface OutputDownloadsProps {
  sessionId: string;
  disabled?: boolean;
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

export const OutputDownloads: React.FC<OutputDownloadsProps> = ({ sessionId, disabled = false }) => {
  const [downloading, setDownloading] = useState<Set<OutputType>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputProgress, setOutputProgress] = useState<OutputProgress | null>(null);
  const { socket } = useSocket();

  // Listen for output progress events via WebSocket
  useEffect(() => {
    if (!socket || !sessionId) {
      return;
    }

    console.log('[OutputDownloads] Setting up output-progress listener for session:', sessionId);

    // Subscribe to session updates
    socket.emit('subscribe', sessionId);

    // Listen for output progress
    const outputProgressEvent = `output-progress:${sessionId}`;
    const outputsEvent = `outputs:${sessionId}`;

    const handleOutputProgress = (progress: OutputProgress) => {
      console.log('[OutputDownloads] Received output progress:', progress);
      setOutputProgress(progress);

      if (progress.status === 'running') {
        setGenerating(true);
        setError(null);
      } else if (progress.status === 'completed') {
        setGenerating(false);
        setOutputProgress(null); // Clear progress when done
      } else if (progress.status === 'error') {
        setGenerating(false);
        setError(progress.error || 'Output generation failed');
      }
    };

    const handleOutputsGenerated = (data: any) => {
      console.log('[OutputDownloads] Outputs generated:', data);
      setGenerating(false);
      setOutputProgress(null);
    };

    socket.on(outputProgressEvent, handleOutputProgress);
    socket.on(outputsEvent, handleOutputsGenerated);

    return () => {
      console.log('[OutputDownloads] Cleaning up output-progress listener');
      socket.off(outputProgressEvent, handleOutputProgress);
      socket.off(outputsEvent, handleOutputsGenerated);
      socket.emit('unsubscribe', sessionId);
    };
  }, [socket, sessionId]);

  const handleDownload = async (type: OutputType, filename: string) => {
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

  const handleGenerateOutputs = async () => {
    try {
      setGenerating(true);
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
      await sessionAPI.generate(sessionId);
    } catch (err: any) {
      console.error('Generate failed:', err);
      setError(err.response?.data?.message || 'Failed to start output generation');
      setGenerating(false);
      setOutputProgress(null);
    }
  };

  const handleGeneratePaper = async () => {
    try {
      setGenerating(true);
      setError(null);
      await sessionAPI.generatePaper(sessionId);
    } catch (err: any) {
      console.error('Paper generation failed:', err);
      setError(err.response?.data?.message || 'Failed to generate paper');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-6">
        <Download className="text-primary-600" size={24} />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Download Outputs</h3>
          <p className="text-sm text-gray-500">Export your literature review results</p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Generate Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <button
          onClick={handleGenerateOutputs}
          disabled={disabled || generating}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Generating...
            </>
          ) : (
            <>
              <FileText size={18} />
              Generate All Outputs
            </>
          )}
        </button>
        <button
          onClick={handleGeneratePaper}
          disabled={disabled || generating}
          className="btn-secondary flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Generating...
            </>
          ) : (
            <>
              <File size={18} />
              Generate PRISMA Paper
            </>
          )}
        </button>
      </div>

      {/* Enhanced Progress Bar */}
      {outputProgress && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">{outputProgress.currentTask}</span>
            <span className="text-sm text-blue-700 font-semibold">{Math.round(outputProgress.progress)}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-blue-200 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-700 h-3 rounded-full transition-all duration-300"
              style={{ width: `${outputProgress.progress}%` }}
            ></div>
          </div>

          {/* Stage Info */}
          <div className="flex justify-between text-xs text-blue-700">
            <span className="font-medium">
              Stage {outputProgress.completedStages}/{outputProgress.totalStages}: {outputProgress.stage.toUpperCase()}
            </span>
            {outputProgress.timeElapsed !== undefined && (
              <span>
                Elapsed: {formatTime(outputProgress.timeElapsed)}
                {outputProgress.estimatedTimeRemaining !== undefined && outputProgress.estimatedTimeRemaining > 0 && (
                  <> | ETA: {formatTime(outputProgress.estimatedTimeRemaining)}</>
                )}
              </span>
            )}
          </div>

          {/* LaTeX Generation Details */}
          {outputProgress.latexBatchProgress && (
            <div className="pt-3 border-t border-blue-300 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-blue-600 font-medium">Batch</p>
                  <p className="text-blue-900 font-semibold">
                    {outputProgress.latexBatchProgress.currentBatch}/{outputProgress.latexBatchProgress.totalBatches}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600 font-medium">Papers Processed</p>
                  <p className="text-blue-900 font-semibold">
                    {outputProgress.latexBatchProgress.papersProcessed || 0}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600 font-medium">Papers Remaining</p>
                  <p className="text-blue-900 font-semibold">
                    {outputProgress.latexBatchProgress.papersRemaining || 0}
                  </p>
                </div>
                <div>
                  <p className="text-blue-600 font-medium">Document Size</p>
                  <p className="text-blue-900 font-semibold">
                    {formatBytes(outputProgress.latexBatchProgress.currentDocumentSize || 0)}
                    {outputProgress.latexBatchProgress.estimatedFinalSize > 0 && (
                      <span className="text-blue-700"> / ~{formatBytes(outputProgress.latexBatchProgress.estimatedFinalSize)}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Download Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {OUTPUT_FILES.map((file) => {
          const isDownloading = downloading.has(file.type);
          return (
            <button
              key={file.type}
              onClick={() => handleDownload(file.type, file.filename)}
              disabled={disabled || isDownloading}
              className="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex-shrink-0 p-3 bg-primary-100 text-primary-600 rounded-lg">
                {isDownloading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  file.icon
                )}
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

      {/* Info Message */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Outputs are generated progressively as the search progresses.
          You can download files at any time, even before the search is complete. Use "Generate All Outputs"
          to create all files at once, or "Generate PRISMA Paper" to create the final research paper using AI.
        </p>
      </div>
    </div>
  );
};
