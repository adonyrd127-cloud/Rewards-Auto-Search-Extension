'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Monitor,
  Smartphone,
  Globe,
  MoreHorizontal,
  Play,
  Pause,
  Square,
  Trash2,
  Eye,
  Search,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Loader,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiPost, apiDelete } from '@/hooks/use-api';
import type { UseWebSocketReturn } from '@/hooks/use-websocket';
import { format } from 'date-fns';

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

interface SessionsProps {
  ws: UseWebSocketReturn;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  idle: { label: 'Idle', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: Clock },
  running: { label: 'Running', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Loader },
  paused: { label: 'Paused', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Pause },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  stopped: { label: 'Stopped', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

const modeConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  desktop: { label: 'Desktop', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Monitor },
  mobile: { label: 'Mobile', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400', icon: Smartphone },
  edge: { label: 'Edge', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', icon: Globe },
};

export function Sessions({ ws }: SessionsProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Update sessions from WebSocket
  useEffect(() => {
    if (ws.sessionStatuses.size > 0) {
      setSessions(prev => prev.map(session => {
        const wsStatus = ws.sessionStatuses.get(session.id);
        if (wsStatus) {
          return {
            ...session,
            status: wsStatus.status,
            completedSearches: wsStatus.completedSearches,
            totalSearches: wsStatus.totalSearches,
          };
        }
        return session;
      }));
    }
  }, [ws.sessionStatuses]);

  // Refresh on session complete
  useEffect(() => {
    if (ws.lastSessionComplete) {
      fetchSessions();
    }
  }, [ws.lastSessionComplete, fetchSessions]);

  const handleStart = async (sessionId: string) => {
    try {
      setActionLoading(sessionId);
      await apiPost(`/api/sessions/${sessionId}/run`);
      ws.startSession(sessionId);
      toast.success('Session started!');
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async (sessionId: string) => {
    try {
      setActionLoading(sessionId);
      await apiPost(`/api/sessions/${sessionId}/stop`);
      ws.stopSession(sessionId);
      toast.success('Session stopped');
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (sessionId: string) => {
    try {
      setActionLoading(sessionId);
      await apiDelete(`/api/sessions/${sessionId}`);
      toast.success('Session deleted');
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetail = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSession(data);
        setDetailOpen(true);
      }
    } catch {
      toast.error('Failed to load session details');
    }
  };

  const handleCreate = async () => {
    try {
      await apiPost('/api/sessions', { mode: 'desktop' });
      toast.success('Session created!');
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sessions</h2>
          <p className="text-sm text-muted-foreground">{sessions.length} total sessions</p>
        </div>
        <Button
          onClick={handleCreate}
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Plus className="h-4 w-4" />
          New Session
        </Button>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No sessions yet</p>
              <p className="text-xs mt-1">Create a new session to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Mode</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="w-[100px]">Points</TableHead>
                    <TableHead className="w-[140px]">Created</TableHead>
                    <TableHead className="w-[60px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => {
                    const mode = modeConfig[session.mode] ?? modeConfig.desktop;
                    const status = statusConfig[session.status] ?? statusConfig.idle;
                    const ModeIcon = mode.icon;
                    const progress = session.totalSearches > 0
                      ? Math.round((session.completedSearches / session.totalSearches) * 100)
                      : 0;

                    return (
                      <TableRow key={session.id}>
                        <TableCell>
                          <Badge variant="secondary" className={`${mode.color} gap-1`}>
                            <ModeIcon className="h-3 w-3" />
                            {mode.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`${status.color} gap-1`}>
                            {session.status === 'running' && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            )}
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-[120px]">
                            <div className="flex items-center justify-between text-xs">
                              <span>{session.completedSearches}/{session.totalSearches}</span>
                              <span className="text-muted-foreground">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-emerald-600">{session.pointsEarned}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(session.createdAt), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={actionLoading === session.id}
                              >
                                {actionLoading === session.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetail(session.id)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {(session.status === 'idle' || session.status === 'paused') && (
                                <DropdownMenuItem onClick={() => handleStart(session.id)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  {session.status === 'paused' ? 'Resume' : 'Start'}
                                </DropdownMenuItem>
                              )}
                              {(session.status === 'running' || session.status === 'paused') && (
                                <DropdownMenuItem onClick={() => handleStop(session.id)}>
                                  <Square className="h-4 w-4 mr-2" />
                                  Stop
                                </DropdownMenuItem>
                              )}
                              {session.status !== 'running' && (
                                <DropdownMenuItem
                                  onClick={() => handleDelete(session.id)}
                                  className="text-red-600 dark:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Session Details
              {selectedSession && (() => {
                const mode = modeConfig[selectedSession.mode] ?? modeConfig.desktop;
                const ModeIcon = mode.icon;
                return (
                  <Badge variant="secondary" className={`${mode.color} gap-1`}>
                    <ModeIcon className="h-3 w-3" />
                    {mode.label}
                  </Badge>
                );
              })()}
              {selectedSession && (() => {
                const status = statusConfig[selectedSession.status] ?? statusConfig.idle;
                return (
                  <Badge variant="secondary" className={status.color}>
                    {status.label}
                  </Badge>
                );
              })()}
            </DialogTitle>
          </DialogHeader>

          {selectedSession && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">{selectedSession.pointsEarned}</p>
                  <p className="text-xs text-muted-foreground">Points</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {selectedSession.completedSearches}/{selectedSession.totalSearches}
                  </p>
                  <p className="text-xs text-muted-foreground">Searches</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {selectedSession.totalSearches > 0
                      ? Math.round((selectedSession.completedSearches / selectedSession.totalSearches) * 100)
                      : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">Complete</p>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <Progress
                  value={selectedSession.totalSearches > 0
                    ? (selectedSession.completedSearches / selectedSession.totalSearches) * 100
                    : 0}
                  className="h-2"
                />
              </div>

              {/* Search entries */}
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">Search Entries</h3>
                <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {selectedSession.entries.map((entry) => {
                    const entryStatus = statusConfig[entry.status] ?? statusConfig.idle;
                    const StatusIcon = entryStatus.icon;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 p-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                      >
                        <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${entry.status === 'completed' ? 'text-emerald-500' : entry.status === 'searching' ? 'text-amber-500' : entry.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`} />
                        <span className="text-muted-foreground text-xs w-6">{entry.searchIndex + 1}</span>
                        <span className="flex-1 truncate">{entry.query}</span>
                        {entry.pointsEarned > 0 && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            +{entry.pointsEarned} pts
                          </Badge>
                        )}
                        {entry.duration > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            {(entry.duration / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
