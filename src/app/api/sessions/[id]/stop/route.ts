import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestSessionStop, isSessionActive } from "@/lib/search-engine";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await db.searchSession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status !== "running" && session.status !== "paused") {
      return NextResponse.json({ error: "Session is not running or paused" }, { status: 400 });
    }

    // Signal the search engine to stop
    if (isSessionActive(id)) {
      requestSessionStop(id);
    } else {
      // If not actively running, just update the status directly
      await db.searchSession.update({
        where: { id },
        data: {
          status: "stopped",
          completedAt: new Date(),
        },
      });
    }

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
    const message = error instanceof Error ? error.message : "Failed to stop session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
