import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export interface SearchEngineConfig {
  minDelay: number; // seconds
  maxDelay: number; // seconds
  cooldownBetweenSearches: number; // seconds
  enableRandomDelay: boolean;
}

export interface SearchProgress {
  sessionId: string;
  entryId: string;
  searchIndex: number;
  totalSearches: number;
  status: "searching" | "completed" | "failed";
  query: string;
  pointsEarned: number;
  duration: number;
}

type ProgressCallback = (progress: SearchProgress) => void;

// Active sessions tracker to support stop/pause
const activeSessions = new Map<string, { shouldStop: boolean; shouldPause: boolean }>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(minSec: number, maxSec: number): number {
  const minMs = minSec * 1000;
  const maxMs = maxSec * 1000;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export function requestSessionStop(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.shouldStop = true;
    session.shouldPause = false;
  }
}

export function requestSessionPause(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.shouldPause = true;
  }
}

export function requestSessionResume(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.shouldPause = false;
  }
}

export function isSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

export async function runSearchSession(
  sessionId: string,
  config: SearchEngineConfig,
  onProgress?: ProgressCallback
): Promise<void> {
  // Register this session as active
  activeSessions.set(sessionId, { shouldStop: false, shouldPause: false });

  try {
    // Get session with entries
    const session = await db.searchSession.findUnique({
      where: { id: sessionId },
      include: { entries: { orderBy: { searchIndex: "asc" } } },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== "running") {
      throw new Error(`Session ${sessionId} is not in running state`);
    }

    const pendingEntries = session.entries.filter((e) => e.status === "pending");

    for (const entry of pendingEntries) {
      const controller = activeSessions.get(sessionId);
      if (!controller || controller.shouldStop) {
        await updateSessionStatus(sessionId, "stopped");
        break;
      }

      // Wait while paused
      while (controller.shouldPause && !controller.shouldStop) {
        await delay(1000);
      }

      if (controller.shouldStop) {
        await updateSessionStatus(sessionId, "stopped");
        break;
      }

      // Mark entry as searching
      await db.searchEntry.update({
        where: { id: entry.id },
        data: { status: "searching" },
      });

      const startTime = Date.now();

      try {
        // Perform the actual search using z-ai-web-dev-sdk
        const zai = await ZAI.create();
        await zai.functions.invoke("web_search", {
          query: entry.query,
          num: 5,
        });

        const duration = Date.now() - startTime;

        // Simulate points earning (3-5 points per search as per Microsoft Rewards)
        const pointsEarned = Math.floor(Math.random() * 3) + 3;

        // Mark entry as completed
        await db.searchEntry.update({
          where: { id: entry.id },
          data: {
            status: "completed",
            pointsEarned,
            duration,
            searchedAt: new Date(),
          },
        });

        // Update session progress
        const completedCount = await db.searchEntry.count({
          where: { sessionId, status: "completed" },
        });

        const totalPoints = await db.searchEntry.aggregate({
          where: { sessionId, status: "completed" },
          _sum: { pointsEarned: true },
        });

        await db.searchSession.update({
          where: { id: sessionId },
          data: {
            completedSearches: completedCount,
            pointsEarned: totalPoints._sum.pointsEarned ?? 0,
          },
        });

        // Notify progress
        if (onProgress) {
          onProgress({
            sessionId,
            entryId: entry.id,
            searchIndex: entry.searchIndex,
            totalSearches: session.totalSearches,
            status: "completed",
            query: entry.query,
            pointsEarned,
            duration,
          });
        }
      } catch {
        const duration = Date.now() - startTime;

        // Mark entry as failed
        await db.searchEntry.update({
          where: { id: entry.id },
          data: {
            status: "failed",
            duration,
          },
        });

        if (onProgress) {
          onProgress({
            sessionId,
            entryId: entry.id,
            searchIndex: entry.searchIndex,
            totalSearches: session.totalSearches,
            status: "failed",
            query: entry.query,
            pointsEarned: 0,
            duration,
          });
        }
      }

      // Apply delay between searches
      const searchCooldown = config.cooldownBetweenSearches * 1000;
      await delay(searchCooldown);

      // Apply random delay if enabled
      if (config.enableRandomDelay) {
        const randomDelay = getRandomDelay(config.minDelay, config.maxDelay);
        await delay(randomDelay);
      }
    }

    // Check if session completed all searches
    const controller = activeSessions.get(sessionId);
    if (!controller?.shouldStop) {
      const remainingPending = await db.searchEntry.count({
        where: { sessionId, status: { in: ["pending", "searching"] } },
      });

      if (remainingPending === 0) {
        await db.searchSession.update({
          where: { id: sessionId },
          data: {
            status: "completed",
            completedAt: new Date(),
          },
        });

        // Update daily stats
        await updateDailyStats(sessionId);
      }
    }
  } finally {
    // Clean up active session tracker
    activeSessions.delete(sessionId);
  }
}

async function updateSessionStatus(sessionId: string, status: string): Promise<void> {
  const updateData: Record<string, unknown> = { status };

  if (status === "completed" || status === "stopped") {
    updateData.completedAt = new Date();
  }

  await db.searchSession.update({
    where: { id: sessionId },
    data: updateData,
  });

  if (status === "completed" || status === "stopped") {
    await updateDailyStats(sessionId);
  }
}

async function updateDailyStats(sessionId: string): Promise<void> {
  const session = await db.searchSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) return;

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  // Get all completed sessions for today
  const todayStart = new Date(today);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const todaySessions = await db.searchSession.findMany({
    where: {
      mode: session.mode,
      status: { in: ["completed", "stopped"] },
      completedAt: {
        gte: todayStart,
        lt: todayEnd,
      },
    },
  });

  const totalPoints = todaySessions.reduce((sum, s) => sum + s.pointsEarned, 0);
  const sessionsRun = todaySessions.length;

  const desktopSearches = todaySessions
    .filter((s) => s.mode === "desktop")
    .reduce((sum, s) => sum + s.completedSearches, 0);

  const mobileSearches = todaySessions
    .filter((s) => s.mode === "mobile")
    .reduce((sum, s) => sum + s.completedSearches, 0);

  const edgeSearches = todaySessions
    .filter((s) => s.mode === "edge")
    .reduce((sum, s) => sum + s.completedSearches, 0);

  await db.dailyStats.upsert({
    where: { date: today },
    update: {
      desktopSearches,
      mobileSearches,
      edgeSearches,
      totalPoints,
      sessionsRun,
    },
    create: {
      date: today,
      desktopSearches,
      mobileSearches,
      edgeSearches,
      totalPoints,
      sessionsRun,
    },
  });
}
