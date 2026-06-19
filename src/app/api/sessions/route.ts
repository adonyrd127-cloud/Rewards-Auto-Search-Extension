import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateQueries } from "@/lib/query-generator";

export async function GET() {
  try {
    const sessions = await db.searchSession.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        entries: {
          orderBy: { searchIndex: "asc" },
        },
      },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body.mode ?? "desktop";

    if (!["desktop", "mobile", "edge"].includes(mode)) {
      return NextResponse.json({ error: "Invalid mode. Must be desktop, mobile, or edge." }, { status: 400 });
    }

    // Get settings to determine search count
    let settings = await db.searchSettings.findFirst();
    if (!settings) {
      settings = await db.searchSettings.create({ data: {} });
    }

    const searchCountByMode: Record<string, number> = {
      desktop: settings.desktopSearchCount,
      mobile: settings.mobileSearchCount,
      edge: settings.edgeSearchCount,
    };

    const totalSearches = searchCountByMode[mode] ?? 30;

    // Generate queries based on settings
    const queries = await generateQueries({
      count: totalSearches,
      source: settings.querySource as "trending" | "random" | "custom",
      customQueries: settings.customQueries,
    });

    // Create session
    const session = await db.searchSession.create({
      data: {
        mode,
        status: "idle",
        totalSearches,
        completedSearches: 0,
        pointsEarned: 0,
      },
    });

    // Create entries
    const entriesData = queries.map((query, index) => ({
      sessionId: session.id,
      query,
      status: "pending" as const,
      searchIndex: index,
    }));

    await db.searchEntry.createMany({
      data: entriesData,
    });

    // Return session with entries
    const fullSession = await db.searchSession.findUnique({
      where: { id: session.id },
      include: {
        entries: {
          orderBy: { searchIndex: "asc" },
        },
      },
    });

    return NextResponse.json(fullSession, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
