'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Square,
  Search,
  Loader2,
  Monitor,
  Smartphone,
  Globe,
  CheckCircle2,
} from 'lucide-react';
import type { UseWebSocketReturn } from '@/hooks/use-websocket';

interface Session {
  id: string;
  mode: string;
  status: string;
  totalSearches: number;
  completedSearches: number;
  pointsEarned: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  entries: SearchEntry[];
}

interface SearchEntry {
  id: string;
  query: string;
  status: string;
  pointsEarned: number;
  searchIndex: number;
  duration: number;
  searchedAt: string | null;
}

interface ActiveSessionProps {
  ws: UseWebSocketReturn;
  onStatsUpdate: () => void;
}

export function ActiveSession({ ws, onStatsUpdate }: ActiveSessionProps) {
  const [fetchedSession, setFetchedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const doFetchRunningSession = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const sessions: Session[] = await res.json();
        const active = sessions.find(s => s.status === 'running' || s.status === 'paused');
        setFetchedSession(active ?? null);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch using mounted ref pattern
  useEffect(() => {
    mountedRef.current = true;
    doFetchRunningSession();
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [doFetchRunningSession]);

  // Derive current query from WebSocket
  const currentQuery = ws.currentSearch?.query ?? '';

  // Merge fetched session with WebSocket status updates
  const runningSession = useMemo(() => {
    if (!fetchedSession) return null;
    const wsStatus = ws.sessionStatuses.get(fetchedSession.id);
    if (wsStatus) {
      return {
        ...fetchedSession,
        status: wsStatus.status,
        completedSearches: wsStatus.completedSearches,
        totalSearches: wsStatus.totalSearches,
      };
    }
    return fetchedSession;
  }, [fetchedSession, ws.sessionStatuses]);

  // Refresh when session completes via WS
  const prevSessionCompleteRef = useRef(ws.lastSessionComplete);
  useEffect(() => {
    if (ws.lastSessionComplete && ws.lastSessionComplete !== prevSessionCompleteRef.current) {
      prevSessionCompleteRef.current = ws.lastSessionComplete;
      onStatsUpdate();
      // Schedule refresh after completion
      refreshTimerRef.current = setTimeout(() => {
        doFetchRunningSession();
      }, 1000);
    }
  }, [ws.lastSessionComplete, onStatsUpdate, doFetchRunningSession]);

  // Refresh when search completes (for stats update)
  const prevSearchCompleteRef = useRef(ws.lastSearchComplete);
  useEffect(() => {
    if (ws.lastSearchComplete && ws.lastSearchComplete !== prevSearchCompleteRef.current) {
      prevSearchCompleteRef.current = ws.lastSearchComplete;
      onStatsUpdate();
    }
  }, [ws.lastSearchComplete, onStatsUpdate]);

  // When session status becomes completed/stopped, schedule a fetch refresh
  useEffect(() => {
    if (runningSession && (runningSession.status === 'completed' || runningSession.status === 'stopped')) {
      refreshTimerRef.current = setTimeout(() => {
        doFetchRunningSession();
      }, 1500);
    }
  }, [runningSession?.status, runningSession?.id, doFetchRunningSession]);

  const handlePause = async () => {
    if (!runningSession) return;
    try {
      const res = await fetch(`/api/sessions/${runningSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      if (res.ok) {
        ws.pauseSession(runningSession.id);
        doFetchRunningSession();
      }
    } catch {
      // error handling
    }
  };

  const handleResume = async () => {
    if (!runningSession) return;
    try {
      const res = await fetch(`/api/sessions/${runningSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      });
      if (res.ok) {
        ws.resumeSession(runningSession.id);
        doFetchRunningSession();
      }
    } catch {
      // error handling
    }
  };

  const handleStop = async () => {
    if (!runningSession) return;
    try {
      await fetch(`/api/sessions/${runningSession.id}/stop`, { method: 'POST' });
      ws.stopSession(runningSession.id);
      doFetchRunningSession();
      onStatsUpdate();
    } catch {
      // error handling
    }
  };

  const modeIcon = runningSession?.mode === 'mobile' ? Smartphone :
    runningSession?.mode === 'edge' ? Globe : Monitor;

  const modeColor = runningSession?.mode === 'mobile' ? 'text-teal-600' :
    runningSession?.mode === 'edge' ? 'text-cyan-600' : 'text-emerald-600';

  const progress = runningSession && runningSession.totalSearches > 0
    ? Math.round((runningSession.completedSearches / runningSession.totalSearches) * 100)
    : 0;

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <p className="text-sm">Loading active session...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-emerald-200 dark:border-emerald-800 overflow-hidden relative">
      {/* Animated background accent */}
      {runningSession && runningSession.status === 'running' && (
        <motion.div
          className="absolute inset-x-0 top-0 h-1 bg-emerald-500"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 2, repeat: Infinity, repeatType: 'reverse' }}
          style={{ transformOrigin: 'left' }}
        />
      )}

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-emerald-600" />
            Active Session
          </CardTitle>
          {runningSession && (
            <Badge
              variant={runningSession.status === 'running' ? 'default' : 'secondary'}
              className={
                runningSession.status === 'running'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : runningSession.status === 'paused'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : ''
              }
            >
              {runningSession.status === 'running' && (
                <span className="mr-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
              {runningSession.status.charAt(0).toUpperCase() + runningSession.status.slice(1)}
            </Badge>
          )}
        </div>
        {!runningSession && (
          <CardDescription>No active session running</CardDescription>
        )}
      </CardHeader>

      <CardContent>
        <AnimatePresence mode="wait">
          {runningSession ? (
            <motion.div
              key={runningSession.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Session info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {(() => {
                  const Icon = modeIcon;
                  return <Icon className={`h-5 w-5 ${modeColor}`} />;
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {runningSession.mode.charAt(0).toUpperCase() + runningSession.mode.slice(1)} Search
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Session {runningSession.id.slice(-6)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-600">
                    {runningSession.pointsEarned} pts
                  </p>
                  <p className="text-xs text-muted-foreground">earned</p>
                </div>
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">
                    {runningSession.completedSearches}/{runningSession.totalSearches}
                    <span className="text-muted-foreground ml-1">({progress}%)</span>
                  </span>
                </div>
                <Progress value={progress} className="h-2.5" />
              </div>

              {/* Current query */}
              <AnimatePresence mode="wait">
                {currentQuery && runningSession.status === 'running' && (
                  <motion.div
                    key={currentQuery}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-center gap-2 p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-300 truncate">
                      {currentQuery}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Last completed */}
              {ws.lastSearchComplete && ws.lastSearchComplete.sessionId === runningSession.id && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="truncate">Completed: {ws.lastSearchComplete.query}</span>
                  <Badge variant="secondary" className="text-xs ml-auto">
                    +{ws.lastSearchComplete.pointsEarned} pts
                  </Badge>
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center gap-2 pt-1">
                {runningSession.status === 'running' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePause}
                    className="gap-1.5"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </Button>
                )}
                {runningSession.status === 'paused' && (
                  <Button
                    size="sm"
                    onClick={handleResume}
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStop}
                  className="gap-1.5"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-8 text-muted-foreground"
            >
              <Search className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No active session</p>
              <p className="text-xs mt-1">Use Quick Actions to start a search</p>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
