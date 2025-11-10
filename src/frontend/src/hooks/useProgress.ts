import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { ProgressUpdate, Paper } from '../types';

export const useProgress = (socket: Socket | null, sessionId: string | null) => {
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !sessionId) {
      return;
    }

    // Subscribe to session updates
    socket.emit('subscribe', sessionId);

    // Listen for progress updates
    const progressHandler = (data: ProgressUpdate) => {
      setProgress(data);
    };

    // Listen for new papers
    const paperHandler = (paper: Paper) => {
      setPapers((prev) => [...prev, paper]);
    };

    // Listen for errors
    const errorHandler = (err: { message: string }) => {
      setError(err.message);
    };

    // Listen for outputs
    const outputsHandler = (data: any) => {
      console.log('Outputs generated:', data);
    };

    socket.on(`progress:${sessionId}`, progressHandler);
    socket.on(`paper:${sessionId}`, paperHandler);
    socket.on(`error:${sessionId}`, errorHandler);
    socket.on(`outputs:${sessionId}`, outputsHandler);

    return () => {
      socket.off(`progress:${sessionId}`, progressHandler);
      socket.off(`paper:${sessionId}`, paperHandler);
      socket.off(`error:${sessionId}`, errorHandler);
      socket.off(`outputs:${sessionId}`, outputsHandler);
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
