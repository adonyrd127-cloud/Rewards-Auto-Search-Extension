import { createServer } from "http";
import { Server } from "socket.io";

// ============================================================================
// Types
// ============================================================================

interface SearchEntryData {
  id: string;
  sessionId: string;
  query: string;
  status: string;
  pointsEarned: number;
  searchIndex: number;
  duration: number;
  searchedAt: string | null;
}

interface SessionData {
  id: string;
  mode: string;
  status: string;
  totalSearches: number;
  completedSearches: number;
  pointsEarned: number;
  startedAt: string | null;
  completedAt: string | null;
  entries: SearchEntryData[];
}

interface SearchSettings {
  minDelay: number;
  maxDelay: number;
  enableRandomDelay: boolean;
}

interface ActiveSession {
  sessionId: string;
  socketId: string;
  status: "running" | "paused" | "stopped";
  entries: SearchEntryData[];
  currentIndex: number;
  timer: ReturnType<typeof setTimeout> | null;
  abortController: AbortController | null;
}

// ============================================================================
// Client → Server Event Payloads
// ============================================================================

interface SessionStartPayload {
  sessionId: string;
}

interface SessionStopPayload {
  sessionId: string;
}

interface SessionPausePayload {
  sessionId: string;
}

interface SessionResumePayload {
  sessionId: string;
}

// ============================================================================
// Server → Client Event Payloads
// ============================================================================

interface SessionStatusPayload {
  sessionId: string;
  status: string;
  completedSearches: number;
  totalSearches: number;
}

interface SearchProgressPayload {
  sessionId: string;
  entryId: string;
  query: string;
  status: string;
  pointsEarned: number;
}

interface SearchCompletePayload {
  sessionId: string;
  entryId: string;
  query: string;
  pointsEarned: number;
  duration: number;
}

interface SessionCompletePayload {
  sessionId: string;
  totalPoints: number;
  totalSearches: number;
}

interface ErrorPayload {
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

const PORT = 3003;
const MAIN_APP_BASE = "http://localhost:3000";

// ============================================================================
// State
// ============================================================================

const activeSessions = new Map<string, ActiveSession>();

// ============================================================================
// HTTP Server & Socket.IO Setup
// ============================================================================

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ============================================================================
// Helper: API calls to the main app
// ============================================================================

async function fetchSessionFromAPI(
  sessionId: string
): Promise<SessionData | null> {
  try {
    const res = await fetch(`${MAIN_APP_BASE}/api/sessions/${sessionId}`);
    if (!res.ok) {
      console.error(
        `Failed to fetch session ${sessionId}: ${res.status} ${res.statusText}`
      );
      return null;
    }
    const data = await res.json();
    return data.session ?? data;
  } catch (err) {
    console.error(`Error fetching session ${sessionId}:`, err);
    return null;
  }
}

async function startSessionOnAPI(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${MAIN_APP_BASE}/api/sessions/${sessionId}/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    if (!res.ok) {
      console.error(
        `Failed to start session ${sessionId}: ${res.status} ${res.statusText}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Error starting session ${sessionId}:`, err);
    return false;
  }
}

async function updateSessionOnAPI(
  sessionId: string,
  updates: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`${MAIN_APP_BASE}/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      console.error(
        `Failed to update session ${sessionId}: ${res.status} ${res.statusText}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Error updating session ${sessionId}:`, err);
    return false;
  }
}

async function updateEntryOnAPI(
  entryId: string,
  updates: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(
      `${MAIN_APP_BASE}/api/entries/${entryId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }
    );
    if (!res.ok) {
      console.error(
        `Failed to update entry ${entryId}: ${res.status} ${res.statusText}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Error updating entry ${entryId}:`, err);
    return false;
  }
}

async function fetchSearchSettings(): Promise<SearchSettings | null> {
  try {
    const res = await fetch(`${MAIN_APP_BASE}/api/settings`);
    if (!res.ok) {
      console.error(
        `Failed to fetch settings: ${res.status} ${res.statusText}`
      );
      return null;
    }
    const data = await res.json();
    return data.settings ?? data;
  } catch (err) {
    console.error("Error fetching settings:", err);
    return null;
  }
}

// ============================================================================
// Helper: Random delay
// ============================================================================

function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

// ============================================================================
// Helper: Get socket by session ID
// ============================================================================

function getSocketForSession(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  return io.sockets.sockets.get(session.socketId) || null;
}

// ============================================================================
// Session execution logic
// ============================================================================

async function runSessionLoop(
  sessionId: string,
  entries: SearchEntryData[],
  startIndex: number,
  settings: SearchSettings
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session || session.status === "stopped") return;

  const minDelay = settings.enableRandomDelay ? settings.minDelay : 15;
  const maxDelay = settings.enableRandomDelay ? settings.maxDelay : 45;

  for (let i = startIndex; i < entries.length; i++) {
    const entry = entries[i];

    // Check if session is still active and not stopped
    const currentSession = activeSessions.get(sessionId);
    if (!currentSession || currentSession.status === "stopped") {
      console.log(`Session ${sessionId} stopped, exiting loop at index ${i}`);
      return;
    }

    // If paused, wait until resumed
    if (currentSession.status === "paused") {
      console.log(
        `Session ${sessionId} paused at index ${i}, waiting for resume...`
      );
      await new Promise<void>((resolve) => {
        const checkPause = setInterval(() => {
          const s = activeSessions.get(sessionId);
          if (!s || s.status === "stopped") {
            clearInterval(checkPause);
            resolve();
          } else if (s.status === "running") {
            clearInterval(checkPause);
            resolve();
          }
        }, 500);
      });

      // Re-check after waking from pause
      const afterPause = activeSessions.get(sessionId);
      if (!afterPause || afterPause.status === "stopped") {
        console.log(
          `Session ${sessionId} stopped after pause, exiting at index ${i}`
        );
        return;
      }
    }

    // Update current index
    const activeSession = activeSessions.get(sessionId);
    if (activeSession) {
      activeSession.currentIndex = i;
    }

    // Emit search:progress - searching
    const socket = getSocketForSession(sessionId);
    if (socket) {
      socket.emit("search:progress", {
        sessionId,
        entryId: entry.id,
        query: entry.query,
        status: "searching",
        pointsEarned: 0,
      } satisfies SearchProgressPayload);
    }

    // Update entry status to "searching" via API
    await updateEntryOnAPI(entry.id, { status: "searching" });

    // Simulate search with random delay
    const delay = getRandomDelay(minDelay, maxDelay);
    const searchStart = Date.now();

    // Create a promise that can be aborted
    const abortController = new AbortController();
    if (activeSession) {
      activeSession.abortController = abortController;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, delay);

      if (activeSession) {
        activeSession.timer = timer;
      }

      // Listen for abort
      abortController.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    // Check again if stopped
    const afterDelay = activeSessions.get(sessionId);
    if (!afterDelay || afterDelay.status === "stopped") {
      console.log(
        `Session ${sessionId} stopped during delay, exiting at index ${i}`
      );
      return;
    }

    // Simulate points earned (3-5 points per search for Microsoft Rewards)
    const pointsEarned = Math.floor(Math.random() * 3) + 3;
    const duration = Date.now() - searchStart;

    // Update entry status to "completed" via API
    await updateEntryOnAPI(entry.id, {
      status: "completed",
      pointsEarned,
      duration,
      searchedAt: new Date().toISOString(),
    });

    // Emit search:complete
    if (socket) {
      socket.emit("search:complete", {
        sessionId,
        entryId: entry.id,
        query: entry.query,
        pointsEarned,
        duration,
      } satisfies SearchCompletePayload);
    }

    // Update session progress via API
    const completedCount = i + 1;
    await updateSessionOnAPI(sessionId, {
      completedSearches: completedCount,
      pointsEarned: { increment: pointsEarned },
    });

    // Fetch updated session to get accurate points
    const updatedSession = await fetchSessionFromAPI(sessionId);

    // Emit session:status
    if (socket) {
      socket.emit("session:status", {
        sessionId,
        status: "running",
        completedSearches: completedCount,
        totalSearches: entries.length,
      } satisfies SessionStatusPayload);
    }

    console.log(
      `Session ${sessionId}: Completed search ${completedCount}/${entries.length} - "${entry.query}" - ${pointsEarned} pts`
    );
  }

  // All entries completed
  const finalSession = await fetchSessionFromAPI(sessionId);
  const totalPoints = finalSession?.pointsEarned ?? 0;

  // Update session status to completed
  await updateSessionOnAPI(sessionId, {
    status: "completed",
    completedAt: new Date().toISOString(),
  });

  // Emit session:complete
  const finalSocket = getSocketForSession(sessionId);
  if (finalSocket) {
    finalSocket.emit("session:complete", {
      sessionId,
      totalPoints,
      totalSearches: entries.length,
    } satisfies SessionCompletePayload);

    finalSocket.emit("session:status", {
      sessionId,
      status: "completed",
      completedSearches: entries.length,
      totalSearches: entries.length,
    } satisfies SessionStatusPayload);
  }

  // Clean up
  activeSessions.delete(sessionId);
  console.log(`Session ${sessionId} completed. Total points: ${totalPoints}`);
}

// ============================================================================
// Socket.IO Event Handlers
// ============================================================================

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // ---- session:start ----
  socket.on("session:start", async (payload: SessionStartPayload) => {
    const { sessionId } = payload;
    console.log(`session:start received for ${sessionId}`);

    // Check if session is already active
    if (activeSessions.has(sessionId)) {
      socket.emit("error", {
        message: `Session ${sessionId} is already running or paused`,
      } satisfies ErrorPayload);
      return;
    }

    // Fetch session details from main app
    const sessionData = await fetchSessionFromAPI(sessionId);
    if (!sessionData) {
      socket.emit("error", {
        message: `Failed to fetch session ${sessionId}`,
      } satisfies ErrorPayload);
      return;
    }

    // Get search settings
    const settings = await fetchSearchSettings();
    const searchSettings: SearchSettings = settings ?? {
      minDelay: 15,
      maxDelay: 45,
      enableRandomDelay: true,
    };

    // Filter pending entries
    const pendingEntries = sessionData.entries.filter(
      (e) => e.status === "pending" || e.status === "failed"
    );

    if (pendingEntries.length === 0) {
      socket.emit("error", {
        message: `No pending entries found for session ${sessionId}`,
      } satisfies ErrorPayload);
      return;
    }

    // Start session on API
    const started = await startSessionOnAPI(sessionId);
    if (!started) {
      socket.emit("error", {
        message: `Failed to start session ${sessionId} on API`,
      } satisfies ErrorPayload);
      return;
    }

    // Create active session record
    const activeSession: ActiveSession = {
      sessionId,
      socketId: socket.id,
      status: "running",
      entries: pendingEntries,
      currentIndex: 0,
      timer: null,
      abortController: null,
    };
    activeSessions.set(sessionId, activeSession);

    // Emit initial status
    socket.emit("session:status", {
      sessionId,
      status: "running",
      completedSearches: 0,
      totalSearches: pendingEntries.length,
    } satisfies SessionStatusPayload);

    // Start the simulation loop
    runSessionLoop(sessionId, pendingEntries, 0, searchSettings).catch(
      (err) => {
        console.error(`Error in session loop for ${sessionId}:`, err);
        socket.emit("error", {
          message: `Session loop error: ${err instanceof Error ? err.message : String(err)}`,
        } satisfies ErrorPayload);
        activeSessions.delete(sessionId);
      }
    );
  });

  // ---- session:stop ----
  socket.on("session:stop", async (payload: SessionStopPayload) => {
    const { sessionId } = payload;
    console.log(`session:stop received for ${sessionId}`);

    const session = activeSessions.get(sessionId);
    if (!session) {
      socket.emit("error", {
        message: `Session ${sessionId} is not active`,
      } satisfies ErrorPayload);
      return;
    }

    // Mark as stopped
    session.status = "stopped";

    // Clear any pending timer
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }

    // Abort any in-progress operation
    if (session.abortController) {
      session.abortController.abort();
    }

    // Update session status on API
    await updateSessionOnAPI(sessionId, { status: "stopped" });

    // Emit status
    socket.emit("session:status", {
      sessionId,
      status: "stopped",
      completedSearches: session.currentIndex,
      totalSearches: session.entries.length,
    } satisfies SessionStatusPayload);

    // Clean up
    activeSessions.delete(sessionId);
    console.log(`Session ${sessionId} stopped`);
  });

  // ---- session:pause ----
  socket.on("session:pause", async (payload: SessionPausePayload) => {
    const { sessionId } = payload;
    console.log(`session:pause received for ${sessionId}`);

    const session = activeSessions.get(sessionId);
    if (!session) {
      socket.emit("error", {
        message: `Session ${sessionId} is not active`,
      } satisfies ErrorPayload);
      return;
    }

    if (session.status !== "running") {
      socket.emit("error", {
        message: `Session ${sessionId} is not running (current: ${session.status})`,
      } satisfies ErrorPayload);
      return;
    }

    // Mark as paused
    session.status = "paused";

    // Update session status on API
    await updateSessionOnAPI(sessionId, { status: "paused" });

    // Emit status
    socket.emit("session:status", {
      sessionId,
      status: "paused",
      completedSearches: session.currentIndex,
      totalSearches: session.entries.length,
    } satisfies SessionStatusPayload);

    console.log(`Session ${sessionId} paused at index ${session.currentIndex}`);
  });

  // ---- session:resume ----
  socket.on("session:resume", async (payload: SessionResumePayload) => {
    const { sessionId } = payload;
    console.log(`session:resume received for ${sessionId}`);

    const session = activeSessions.get(sessionId);
    if (!session) {
      socket.emit("error", {
        message: `Session ${sessionId} is not active`,
      } satisfies ErrorPayload);
      return;
    }

    if (session.status !== "paused") {
      socket.emit("error", {
        message: `Session ${sessionId} is not paused (current: ${session.status})`,
      } satisfies ErrorPayload);
      return;
    }

    // Mark as running
    session.status = "running";

    // Update session status on API
    await updateSessionOnAPI(sessionId, { status: "running" });

    // Emit status
    socket.emit("session:status", {
      sessionId,
      status: "running",
      completedSearches: session.currentIndex,
      totalSearches: session.entries.length,
    } satisfies SessionStatusPayload);

    console.log(`Session ${sessionId} resumed at index ${session.currentIndex}`);
  });

  // ---- disconnect ----
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);

    // Find and clean up any sessions associated with this socket
    for (const [sessionId, session] of activeSessions.entries()) {
      if (session.socketId === socket.id) {
        console.log(
          `Cleaning up session ${sessionId} due to disconnect`
        );
        session.status = "stopped";
        if (session.timer) {
          clearTimeout(session.timer);
        }
        if (session.abortController) {
          session.abortController.abort();
        }
        activeSessions.delete(sessionId);
      }
    }
  });

  // ---- error ----
  socket.on("error", (error) => {
    console.error(`Socket error (${socket.id}):`, error);
  });
});

// ============================================================================
// Start Server
// ============================================================================

httpServer.listen(PORT, () => {
  console.log(`Search WebSocket service running on port ${PORT}`);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}, shutting down server...`);

  // Clean up all active sessions
  for (const [sessionId, session] of activeSessions.entries()) {
    console.log(`Cleaning up session ${sessionId} during shutdown`);
    session.status = "stopped";
    if (session.timer) {
      clearTimeout(session.timer);
    }
    if (session.abortController) {
      session.abortController.abort();
    }
  }
  activeSessions.clear();

  io.close(() => {
    httpServer.close(() => {
      console.log("Search WebSocket service closed");
      process.exit(0);
    });
  });

  // Force close after 5 seconds
  setTimeout(() => {
    console.error("Forcing shutdown after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
