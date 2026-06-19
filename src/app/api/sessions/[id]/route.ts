import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
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

    return NextResponse.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status } = body as { status?: string };

    const session = await db.searchSession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Validate status transitions
    const validStatuses = ["idle", "running", "paused", "completed", "stopped"];

    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    // Validate state transitions
    if (status) {
      const transitionError = validateTransition(session.status, status);
      if (transitionError) {
        return NextResponse.json({ error: transitionError }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;

    // Handle timestamps
    if (status === "running" && !session.startedAt) {
      updateData.startedAt = new Date();
    }
    if (status === "completed" || status === "stopped") {
      updateData.completedAt = new Date();
    }

    const updated = await db.searchSession.update({
      where: { id },
      data: updateData,
      include: {
        entries: {
          orderBy: { searchIndex: "asc" },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const session = await db.searchSession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Prevent deleting running sessions
    if (session.status === "running") {
      return NextResponse.json({ error: "Cannot delete a running session. Stop it first." }, { status: 400 });
    }

    await db.searchSession.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Session deleted successfully" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function validateTransition(currentStatus: string, newStatus: string): string | null {
  const transitions: Record<string, string[]> = {
    idle: ["running"],
    running: ["paused", "stopped", "completed"],
    paused: ["running", "stopped"],
    completed: [], // Terminal state
    stopped: [], // Terminal state
  };

  const allowed = transitions[currentStatus];
  if (!allowed) {
    return `Cannot transition from '${currentStatus}'`;
  }

  if (!allowed.includes(newStatus)) {
    return `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: ${allowed.join(", ") || "none"}`;
  }

  return null;
}
