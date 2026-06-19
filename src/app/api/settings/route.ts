import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    let settings = await db.searchSettings.findFirst();

    if (!settings) {
      settings = await db.searchSettings.create({
        data: {},
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    let settings = await db.searchSettings.findFirst();

    if (!settings) {
      settings = await db.searchSettings.create({
        data: {},
      });
    }

    const updated = await db.searchSettings.update({
      where: { id: settings.id },
      data: {
        desktopSearchCount: body.desktopSearchCount ?? settings.desktopSearchCount,
        mobileSearchCount: body.mobileSearchCount ?? settings.mobileSearchCount,
        edgeSearchCount: body.edgeSearchCount ?? settings.edgeSearchCount,
        minDelay: body.minDelay ?? settings.minDelay,
        maxDelay: body.maxDelay ?? settings.maxDelay,
        cooldownBetweenSearches: body.cooldownBetweenSearches ?? settings.cooldownBetweenSearches,
        enableRandomDelay: body.enableRandomDelay ?? settings.enableRandomDelay,
        enableAutoStart: body.enableAutoStart ?? settings.enableAutoStart,
        autoStartTime: body.autoStartTime ?? settings.autoStartTime,
        enableMobileMode: body.enableMobileMode ?? settings.enableMobileMode,
        enableEdgeMode: body.enableEdgeMode ?? settings.enableEdgeMode,
        querySource: body.querySource ?? settings.querySource,
        customQueries: body.customQueries ?? settings.customQueries,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
