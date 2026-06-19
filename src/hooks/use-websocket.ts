'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface SessionStatus {
  sessionId: string;
  status: string;
  completedSearches: number;
  totalSearches: number;
}

interface SearchProgress {
  sessionId: string;
  entryId: string;
  query: string;
  status: string;
  pointsEarned: number;
}

interface SearchComplete {
  sessionId: string;
  entryId: string;
  query: string;
  pointsEarned: number;
  duration: number;
}

interface SessionComplete {
  sessionId: string;
  totalPoints: number;
  totalSearches: number;
}

interface UseWebSocketReturn {
  connected: boolean;
  sessionStatuses: Map<string, SessionStatus>;
  currentSearch: SearchProgress | null;
  lastSearchComplete: SearchComplete | null;
  lastSessionComplete: SessionComplete | null;
  lastError: string | null;
  startSession: (sessionId: string) => void;
  stopSession: (sessionId: string) => void;
  pauseSession: (sessionId: string) => void;
  resumeSession: (sessionId: string) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionStatuses, setSessionStatuses] = useState<Map<string, SessionStatus>>(new Map());
  const [currentSearch, setCurrentSearch] = useState<SearchProgress | null>(null);
  const [lastSearchComplete, setLastSearchComplete] = useState<SearchComplete | null>(null);
  const [lastSessionComplete, setLastSessionComplete] = useState<SessionComplete | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io("/?XTransformPort=3003", {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    socket.on('session:status', (data: SessionStatus) => {
      setSessionStatuses(prev => {
        const next = new Map(prev);
        next.set(data.sessionId, data);
        return next;
      });
    });

    socket.on('search:progress', (data: SearchProgress) => {
      setCurrentSearch(data);
    });

    socket.on('search:complete', (data: SearchComplete) => {
      setLastSearchComplete(data);
    });

    socket.on('session:complete', (data: SessionComplete) => {
      setLastSessionComplete(data);
    });

    socket.on('error', (data: { message: string }) => {
      setLastError(data.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const startSession = useCallback((sessionId: string) => {
    socketRef.current?.emit('session:start', { sessionId });
  }, []);

  const stopSession = useCallback((sessionId: string) => {
    socketRef.current?.emit('session:stop', { sessionId });
  }, []);

  const pauseSession = useCallback((sessionId: string) => {
    socketRef.current?.emit('session:pause', { sessionId });
  }, []);

  const resumeSession = useCallback((sessionId: string) => {
    socketRef.current?.emit('session:resume', { sessionId });
  }, []);

  return {
    connected,
    sessionStatuses,
    currentSearch,
    lastSearchComplete,
    lastSessionComplete,
    lastError,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
  };
}
