import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start");
    const endDate = searchParams.get("end");

    const where: Record<string, unknown> = {};

    if (startDate || endDate) {
      const dateFilter: Record<string, string> = {};
      if (startDate) dateFilter.gte = startDate;
      if (endDate) dateFilter.lte = endDate;
      where.date = dateFilter;
    }

    const dailyStats = await db.dailyStats.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { date: "asc" },
    });

    return NextResponse.json(dailyStats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch daily stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
