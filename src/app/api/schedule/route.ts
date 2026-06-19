import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    let config = await db.scheduleConfig.findFirst();

    if (!config) {
      config = await db.scheduleConfig.create({
        data: {},
      });
    }

    return NextResponse.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch schedule config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    let config = await db.scheduleConfig.findFirst();

    if (!config) {
      config = await db.scheduleConfig.create({
        data: {},
      });
    }

    const updated = await db.scheduleConfig.update({
      where: { id: config.id },
      data: {
        enabled: body.enabled ?? config.enabled,
        desktopTime: body.desktopTime ?? config.desktopTime,
        mobileTime: body.mobileTime ?? config.mobileTime,
        edgeTime: body.edgeTime ?? config.edgeTime,
        runDesktop: body.runDesktop ?? config.runDesktop,
        runMobile: body.runMobile ?? config.runMobile,
        runEdge: body.runEdge ?? config.runEdge,
        daysOfWeek: body.daysOfWeek ?? config.daysOfWeek,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update schedule config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
