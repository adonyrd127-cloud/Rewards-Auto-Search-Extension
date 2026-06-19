'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Coins,
  Search,
  Flame,
  TrendingUp,
  Monitor,
  Smartphone,
  Globe,
  Zap,
  Play,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { ActiveSession } from '@/components/active-session';
import { apiPost } from '@/hooks/use-api';
import type { UseWebSocketReturn } from '@/hooks/use-websocket';

interface Stats {
  today: {
    totalPoints: number;
    desktopSearches: number;
    mobileSearches: number;
    edgeSearches: number;
    sessionsRun: number;
  };
  totalPoints: number;
  totalSearches: number;
  streak: number;
  recentStats: Array<{
    date: string;
    totalPoints: number;
    desktopSearches: number;
    mobileSearches: number;
    edgeSearches: number;
  }>;
  activeSessions: number;
  totalSessions: number;
}

interface Settings {
  desktopSearchCount: number;
  mobileSearchCount: number;
  edgeSearchCount: number;
}

interface DashboardProps {
  ws: UseWebSocketReturn;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function AnimatedNumber({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="text-3xl font-bold tracking-tight"
    >
      {value.toLocaleString()}
    </motion.span>
  );
}

export function Dashboard({ ws }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // silently fail on polling
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchSettings()]);
      setLoading(false);
    };
    init();
  }, [fetchStats, fetchSettings]);

  // Poll stats every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleQuickStart = async (mode: string) => {
    try {
      setStartingSession(mode);
      // Create session
      const session = await apiPost<{ id: string }>('/api/sessions', { mode });
      // Run session
      await apiPost(`/api/sessions/${session.id}/run`);
      // Notify via WebSocket
      ws.startSession(session.id);
      toast.success(`${mode.charAt(0).toUpperCase() + mode.slice(1)} search session started!`);
      fetchStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setStartingSession(null);
    }
  };

  const chartData = stats?.recentStats?.map(s => ({
    date: s.date.slice(5), // MM-DD
    points: s.totalPoints,
    searches: s.desktopSearches + s.mobileSearches + s.edgeSearches,
  })) ?? [];

  const statCards = [
    {
      title: "Today's Points",
      value: stats?.today?.totalPoints ?? 0,
      icon: Coins,
      accent: 'text-emerald-600 dark:text-emerald-400',
      bgAccent: 'bg-emerald-50 dark:bg-emerald-950/30',
      borderAccent: 'border-emerald-200 dark:border-emerald-800',
    },
    {
      title: 'Total Points',
      value: stats?.totalPoints ?? 0,
      icon: TrendingUp,
      accent: 'text-amber-600 dark:text-amber-400',
      bgAccent: 'bg-amber-50 dark:bg-amber-950/30',
      borderAccent: 'border-amber-200 dark:border-amber-800',
    },
    {
      title: 'Total Searches',
      value: stats?.totalSearches ?? 0,
      icon: Search,
      accent: 'text-teal-600 dark:text-teal-400',
      bgAccent: 'bg-teal-50 dark:bg-teal-950/30',
      borderAccent: 'border-teal-200 dark:border-teal-800',
    },
    {
      title: 'Day Streak',
      value: stats?.streak ?? 0,
      icon: Flame,
      accent: 'text-orange-600 dark:text-orange-400',
      bgAccent: 'bg-orange-50 dark:bg-orange-950/30',
      borderAccent: 'border-orange-200 dark:border-orange-800',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.title} variants={itemVariants}>
              <Card className={`border ${card.borderAccent} overflow-hidden`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground font-medium">{card.title}</p>
                      <AnimatedNumber value={card.value} />
                    </div>
                    <div className={`p-3 rounded-xl ${card.bgAccent}`}>
                      <Icon className={`h-5 w-5 ${card.accent}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Active Session + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Active Session */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <ActiveSession ws={ws} onStatsUpdate={fetchStats} />
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-600" />
                Quick Actions
              </CardTitle>
              <CardDescription>Start a new search session</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full justify-start gap-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleQuickStart('desktop')}
                disabled={startingSession !== null}
              >
                {startingSession === 'desktop' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Monitor className="h-4 w-4" />
                )}
                <span>Desktop Search</span>
                <Badge variant="secondary" className="ml-auto bg-emerald-700/50 text-emerald-100">
                  {settings?.desktopSearchCount ?? 30}
                </Badge>
              </Button>

              <Button
                className="w-full justify-start gap-3 bg-teal-600 hover:bg-teal-700 text-white"
                onClick={() => handleQuickStart('mobile')}
                disabled={startingSession !== null}
              >
                {startingSession === 'mobile' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                <span>Mobile Search</span>
                <Badge variant="secondary" className="ml-auto bg-teal-700/50 text-teal-100">
                  {settings?.mobileSearchCount ?? 20}
                </Badge>
              </Button>

              <Button
                className="w-full justify-start gap-3 bg-cyan-600 hover:bg-cyan-700 text-white"
                onClick={() => handleQuickStart('edge')}
                disabled={startingSession !== null}
              >
                {startingSession === 'edge' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="h-4 w-4" />
                )}
                <span>Edge Search</span>
                <Badge variant="secondary" className="ml-auto bg-cyan-700/50 text-cyan-100">
                  {settings?.edgeSearchCount ?? 30}
                </Badge>
              </Button>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Active Sessions</span>
                  <span className="font-semibold text-emerald-600">{stats?.activeSessions ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Total Sessions</span>
                  <span className="font-semibold">{stats?.totalSessions ?? 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Points Chart */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Points Over Time
            </CardTitle>
            <CardDescription>Daily points earned over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pointsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="points"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#pointsGradient)"
                      name="Points"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No data yet. Start a session to see your progress!</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Today's Breakdown */}
      {stats?.today && (stats.today.desktopSearches > 0 || stats.today.mobileSearches > 0 || stats.today.edgeSearches > 0) && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Today&apos;s Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <Monitor className="h-5 w-5 mx-auto text-emerald-600" />
                  <p className="text-2xl font-bold">{stats.today.desktopSearches}</p>
                  <p className="text-xs text-muted-foreground">Desktop</p>
                </div>
                <div className="space-y-1">
                  <Smartphone className="h-5 w-5 mx-auto text-teal-600" />
                  <p className="text-2xl font-bold">{stats.today.mobileSearches}</p>
                  <p className="text-xs text-muted-foreground">Mobile</p>
                </div>
                <div className="space-y-1">
                  <Globe className="h-5 w-5 mx-auto text-cyan-600" />
                  <p className="text-2xl font-bold">{stats.today.edgeSearches}</p>
                  <p className="text-xs text-muted-foreground">Edge</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
