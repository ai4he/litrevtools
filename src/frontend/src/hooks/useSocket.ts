import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Track reconnection events - components can watch this to re-sync state
  const [reconnectCount, setReconnectCount] = useState(0);
  // Track if this is the initial connection vs a reconnection
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      // Reconnection settings
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current?.id);
      setIsConnected(true);

      // If we've connected before, this is a reconnection
      if (hasConnectedOnce.current) {
        console.log('[useSocket] Reconnected! Incrementing reconnectCount');
        setReconnectCount(prev => prev + 1);
      } else {
        hasConnectedOnce.current = true;
      }
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Helper to manually trigger a resubscribe (useful for components)
  const resubscribe = useCallback((sessionId: string) => {
    if (socketRef.current && isConnected) {
      console.log('[useSocket] Resubscribing to session:', sessionId);
      socketRef.current.emit('subscribe', sessionId);
    }
  }, [isConnected]);

  return {
    socket: socketRef.current,
    isConnected,
    reconnectCount,
    resubscribe,
  };
};
