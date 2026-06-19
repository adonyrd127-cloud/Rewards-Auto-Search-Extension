import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Get today's stats
    let todayStats = await db.dailyStats.findUnique({
      where: { date: today },
    });

    if (!todayStats) {
      todayStats = await db.dailyStats.create({
        data: { date: today },
      });
    }

    // Get total points across all time
    const totalPointsResult = await db.dailyStats.aggregate({
      _sum: { totalPoints: true },
    });

    // Get total searches across all time
    const totalSearchesResult = await db.dailyStats.aggregate({
      _sum: {
        desktopSearches: true,
        mobileSearches: true,
        edgeSearches: true,
      },
    });

    const totalPoints = totalPointsResult._sum.totalPoints ?? 0;
    const totalSearches =
      (totalSearchesResult._sum.desktopSearches ?? 0) +
      (totalSearchesResult._sum.mobileSearches ?? 0) +
      (totalSearchesResult._sum.edgeSearches ?? 0);

    // Calculate streak (consecutive days with at least 1 point)
    const streak = await calculateStreak();

    // Get recent 30 days of daily stats for charts
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const recentStats = await db.dailyStats.findMany({
      where: {
        date: { gte: thirtyDaysAgoStr },
      },
      orderBy: { date: "asc" },
    });

    // Get active sessions count
    const activeSessions = await db.searchSession.count({
      where: { status: "running" },
    });

    // Get total sessions count
    const totalSessions = await db.searchSession.count();

    return NextResponse.json({
      today: todayStats,
      totalPoints,
      totalSearches,
      streak,
      recentStats,
      activeSessions,
      totalSessions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function calculateStreak(): Promise<number> {
  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const stats = await db.dailyStats.findUnique({
      where: { date: dateStr },
    });

    if (stats && stats.totalPoints > 0) {
      streak++;
    } else if (i > 0) {
      // Don't break on today if no points yet
      break;
    }
  }

  return streak;
}
