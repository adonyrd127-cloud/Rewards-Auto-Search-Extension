import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runSearchSession, isSessionActive } from "@/lib/search-engine";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await db.searchSession.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: { searchIndex: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status === "running") {
      return NextResponse.json({ error: "Session is already running" }, { status: 400 });
    }

    if (session.status === "completed") {
      return NextResponse.json({ error: "Session is already completed" }, { status: 400 });
    }

    if (isSessionActive(id)) {
      return NextResponse.json({ error: "Session engine is already active for this session" }, { status: 400 });
    }

    // Mark session as running
    await db.searchSession.update({
      where: { id },
      data: {
        status: "running",
        startedAt: session.startedAt ?? new Date(),
      },
    });

    // Get settings for delay config
    let settings = await db.searchSettings.findFirst();
    if (!settings) {
      settings = await db.searchSettings.create({ data: {} });
    }

    // Start the search engine in the background (fire and forget)
    runSearchSession(
      id,
      {
        minDelay: settings.minDelay,
        maxDelay: settings.maxDelay,
        cooldownBetweenSearches: settings.cooldownBetweenSearches,
        enableRandomDelay: settings.enableRandomDelay,
      }
    ).catch(() => {
      // Error is handled inside runSearchSession
    });

    // Return the updated session immediately
    const updatedSession = await db.searchSession.findUnique({
      where: { id },
      include: {
        entries: {
          orderBy: { searchIndex: "asc" },
        },
      },
    });

    return NextResponse.json(updatedSession);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
