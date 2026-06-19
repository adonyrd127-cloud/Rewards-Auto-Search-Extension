import { NextRequest, NextResponse } from "next/server";
import { generateQueries, type QuerySource } from "@/lib/query-generator";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get("count") ?? "30", 10);
    const source = (searchParams.get("source") ?? "trending") as QuerySource;
    const customQueries = searchParams.get("customQueries") ?? "";

    if (isNaN(count) || count < 1 || count > 100) {
      return NextResponse.json(
        { error: "Count must be a number between 1 and 100" },
        { status: 400 }
      );
    }

    const validSources: QuerySource[] = ["trending", "random", "custom"];
    if (!validSources.includes(source)) {
      return NextResponse.json(
        { error: `Source must be one of: ${validSources.join(", ")}` },
        { status: 400 }
      );
    }

    const queries = await generateQueries({
      count,
      source,
      customQueries,
    });

    return NextResponse.json({
      queries,
      count: queries.length,
      source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate queries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
