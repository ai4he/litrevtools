import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { ProgressUpdate, Paper } from '../types';

export const useProgress = (socket: Socket | null, sessionId: string | null) => {
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return {
    progress,
    papers,
    error,
    clearError: () => setError(null),
  };
};
