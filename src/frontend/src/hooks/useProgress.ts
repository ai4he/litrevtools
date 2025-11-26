import { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { ProgressUpdate, Paper } from '../types';
import { sessionAPI } from '../utils/api';

export const useProgress = (socket: Socket | null, sessionId: string | null, reconnectCount?: number) => {
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastReconnectCount = useRef(0);

  // Fetch status and papers on initial load when sessionId is provided
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    console.log('[useProgress] Initial load - fetching status for session:', sessionId);

    const fetchInitialData = async () => {
      try {
        // Fetch both step status and full session data in parallel
        const [stepStatusResponse, sessionResponse] = await Promise.all([
          sessionAPI.getStepStatus(sessionId),
          sessionAPI.getById(sessionId).catch(() => null) // Don't fail if session fetch fails
        ]);

        console.log('[useProgress] Initial status response:', stepStatusResponse);
        console.log('[useProgress] Session response:', sessionResponse);

        // First, try to get data from session (database - most reliable source)
        if (sessionResponse?.success && sessionResponse.session) {
          const session = sessionResponse.session;

          // Set progress from session data
          if (session.progress) {
            setProgress({
              status: session.progress.status || 'completed',
              currentTask: session.progress.currentTask || 'Completed',
              nextTask: session.progress.nextTask || '',
              totalPapers: session.progress.totalPapers || 0,
              processedPapers: session.progress.processedPapers || 0,
              includedPapers: session.progress.includedPapers || 0,
              excludedPapers: session.progress.excludedPapers || 0,
              duplicateCount: session.progress.duplicateCount,
              timeElapsed: session.progress.timeElapsed || 0,
              estimatedTimeRemaining: session.progress.estimatedTimeRemaining || 0,
              progress: session.progress.progress || 100,
            });
          }

          // Load papers from session
          if (session.papers && session.papers.length > 0) {
            console.log('[useProgress] Loading', session.papers.length, 'papers from session');
            setPapers(session.papers);
          }
        }
        // Fallback: use step status if no session data (for active searches)
        else if (stepStatusResponse.success && stepStatusResponse.stepStatus) {
          const { stepStatus } = stepStatusResponse;

          if (stepStatus.status === 'running') {
            setProgress({
              status: 'running',
              currentTask: stepStatus.currentTask || 'Processing...',
              nextTask: '',
              totalPapers: 0,
              processedPapers: 0,
              includedPapers: 0,
              excludedPapers: 0,
              timeElapsed: 0,
              estimatedTimeRemaining: 0,
              progress: stepStatus.progress || 0,
            });
          } else if (stepStatus.status === 'completed') {
            setProgress({
              status: 'completed',
              currentTask: 'Completed',
              nextTask: '',
              totalPapers: 0,
              processedPapers: 0,
              includedPapers: 0,
              excludedPapers: 0,
              timeElapsed: 0,
              estimatedTimeRemaining: 0,
              progress: 100,
            });
          } else if (stepStatus.status === 'error') {
            setError(stepStatus.error || 'Operation failed');
          }
        }
      } catch (err) {
        console.error('[useProgress] Failed to fetch initial data:', err);
      }
    };

    fetchInitialData();
  }, [sessionId]);

  useEffect(() => {
    if (!socket || !sessionId) {
      console.log('[useProgress] Skipping setup - socket:', !!socket, 'sessionId:', sessionId);
      return;
    }

    console.log('[useProgress] Setting up listeners for session:', sessionId);

    // Subscribe to session updates
    socket.emit('subscribe', sessionId);

    // Listen for progress updates
    const progressHandler = (data: ProgressUpdate) => {
      console.log('[useProgress] Received progress update:', data);
      setProgress(data);
    };

    // Listen for new papers
    const paperHandler = (paper: Paper) => {
      console.log('[useProgress] Received paper:', paper.title);
      setPapers((prev) => [...prev, paper]);
    };

    // Listen for errors
    const errorHandler = (err: { message: string }) => {
      console.log('[useProgress] Received error:', err);
      setError(err.message);
    };

    // Listen for outputs
    const outputsHandler = (data: any) => {
      console.log('[useProgress] Outputs generated:', data);
    };

    const progressEvent = `progress:${sessionId}`;
    const paperEvent = `paper:${sessionId}`;
    const errorEvent = `error:${sessionId}`;
    const outputsEvent = `outputs:${sessionId}`;

    console.log('[useProgress] Registering listeners:', {
      progress: progressEvent,
      paper: paperEvent,
      error: errorEvent,
      outputs: outputsEvent
    });

    socket.on(progressEvent, progressHandler);
    socket.on(paperEvent, paperHandler);
    socket.on(errorEvent, errorHandler);
    socket.on(outputsEvent, outputsHandler);

    return () => {
      console.log('[useProgress] Cleaning up listeners for:', sessionId);
      socket.off(progressEvent, progressHandler);
      socket.off(paperEvent, paperHandler);
      socket.off(errorEvent, errorHandler);
      socket.off(outputsEvent, outputsHandler);
      socket.emit('unsubscribe', sessionId);
    };
  }, [socket, sessionId]);

  // Sync status on reconnection
  useEffect(() => {
    // Skip if no reconnect count provided or if it's the same as last time
    if (reconnectCount === undefined || reconnectCount === 0 || reconnectCount === lastReconnectCount.current) {
      return;
    }
    lastReconnectCount.current = reconnectCount;

    if (!socket || !sessionId) {
      return;
    }

    console.log('[useProgress] Reconnected! Syncing status for session:', sessionId);

    // Re-subscribe to session events
    socket.emit('subscribe', sessionId);

    // Fetch current status from REST API
    const syncStatus = async () => {
      try {
        const response = await sessionAPI.getStepStatus(sessionId);
        console.log('[useProgress] Step status response:', response);

        if (response.success && response.stepStatus) {
          const { stepStatus } = response;

          // Update progress based on step 1 status
          if (stepStatus.step === 1) {
            if (stepStatus.status === 'running') {
              setProgress({
                status: 'running',
                currentTask: stepStatus.currentTask || 'Searching...',
                nextTask: '',
                totalPapers: 0,
                processedPapers: 0,
                includedPapers: 0,
                excludedPapers: 0,
                timeElapsed: 0,
                estimatedTimeRemaining: 0,
                progress: stepStatus.progress || 0,
              });
            } else if (stepStatus.status === 'completed') {
              setProgress({
                status: 'completed',
                currentTask: 'Search completed',
                nextTask: '',
                totalPapers: 0,
                processedPapers: 0,
                includedPapers: 0,
                excludedPapers: 0,
                timeElapsed: 0,
                estimatedTimeRemaining: 0,
                progress: 100,
              });
            } else if (stepStatus.status === 'error') {
              setError(stepStatus.error || 'Search failed');
            }
          }
        }
      } catch (err) {
        console.error('[useProgress] Failed to sync status on reconnection:', err);
      }
    };

    syncStatus();
  }, [reconnectCount, socket, sessionId]);

  return {
    progress,
    papers,
    error,
    clearError: () => setError(null),
  };
};
