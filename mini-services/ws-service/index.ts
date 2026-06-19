import { Server } from "socket.io";

const io = new Server(3003, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

interface SessionState {
  sessionId: string;
  status: string;
  completedSearches: number;
  totalSearches: number;
  pointsEarned: number;
  currentQuery: string;
}

const activeSessions = new Map<string, SessionState>();

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send current active sessions to newly connected client
  socket.emit("sessions:active", Array.from(activeSessions.values()));

  // Handle session:start
  socket.on("session:start", async (data: { sessionId: string }) => {
    console.log(`Session start: ${data.sessionId}`);

    // Create a simulated session state
    const state: SessionState = {
      sessionId: data.sessionId,
      status: "running",
      completedSearches: 0,
      totalSearches: 30,
      pointsEarned: 0,
      currentQuery: "",
    };

    activeSessions.set(data.sessionId, state);

    // Notify all clients about session status
    io.emit("session:status", {
      sessionId: data.sessionId,
      status: "running",
      completedSearches: 0,
      totalSearches: state.totalSearches,
    });

    // Simulate search progress
    simulateSearches(data.sessionId);
  });

  // Handle session:stop
  socket.on("session:stop", (data: { sessionId: string }) => {
    console.log(`Session stop: ${data.sessionId}`);
    const state = activeSessions.get(data.sessionId);
    if (state) {
      state.status = "stopped";
      activeSessions.set(data.sessionId, state);
      io.emit("session:status", {
        sessionId: data.sessionId,
        status: "stopped",
        completedSearches: state.completedSearches,
        totalSearches: state.totalSearches,
      });
    }
  });

  // Handle session:pause
  socket.on("session:pause", (data: { sessionId: string }) => {
    console.log(`Session pause: ${data.sessionId}`);
    const state = activeSessions.get(data.sessionId);
    if (state) {
      state.status = "paused";
      activeSessions.set(data.sessionId, state);
      io.emit("session:status", {
        sessionId: data.sessionId,
        status: "paused",
        completedSearches: state.completedSearches,
        totalSearches: state.totalSearches,
      });
    }
  });

  // Handle session:resume
  socket.on("session:resume", (data: { sessionId: string }) => {
    console.log(`Session resume: ${data.sessionId}`);
    const state = activeSessions.get(data.sessionId);
    if (state) {
      state.status = "running";
      activeSessions.set(data.sessionId, state);
      io.emit("session:status", {
        sessionId: data.sessionId,
        status: "running",
        completedSearches: state.completedSearches,
        totalSearches: state.totalSearches,
      });
      // Resume simulated searches
      simulateSearches(data.sessionId);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const sampleQueries = [
  "best hiking trails near me",
  "how to cook pasta al dente",
  "top movies 2026",
  "weather forecast this week",
  "healthy breakfast ideas",
  "learn python tutorial",
  "best wireless headphones",
  "home workout routines",
  "popular travel destinations",
  "how to start a garden",
  "easy dinner recipes",
  "latest tech news",
  "best books to read",
  "yoga for beginners",
  "budget travel tips",
  "diy home projects",
  "best smartphone 2026",
  "how to save money",
  "healthy smoothie recipes",
  "online learning platforms",
  "best podcasts 2026",
  "home office setup ideas",
  "quick lunch ideas",
  "photography tips",
  "meditation benefits",
  "best coding languages",
  "weekend getaway ideas",
  "sustainable living tips",
  "best streaming shows",
  "how to improve memory",
];

async function simulateSearches(sessionId: string) {
  const state = activeSessions.get(sessionId);
  if (!state || state.status !== "running") return;

  for (let i = state.completedSearches; i < state.totalSearches; i++) {
    // Check if still running
    const currentState = activeSessions.get(sessionId);
    if (!currentState || currentState.status !== "running") break;

    const query = sampleQueries[i % sampleQueries.length];
    const points = Math.floor(Math.random() * 3) + 3; // 3-5 points

    // Emit search:progress
    io.emit("search:progress", {
      sessionId,
      entryId: `entry-${i}`,
      query,
      status: "searching",
      pointsEarned: 0,
    });

    // Wait random delay (2-5 seconds for simulation)
    await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 3000));

    // Check again if still running
    const checkState = activeSessions.get(sessionId);
    if (!checkState || checkState.status !== "running") break;

    // Update state
    checkState.completedSearches = i + 1;
    checkState.pointsEarned += points;
    checkState.currentQuery = query;
    activeSessions.set(sessionId, checkState);

    // Emit search:complete
    io.emit("search:complete", {
      sessionId,
      entryId: `entry-${i}`,
      query,
      pointsEarned: points,
      duration: 2000 + Math.floor(Math.random() * 3000),
    });

    // Emit session:status update
    io.emit("session:status", {
      sessionId,
      status: "running",
      completedSearches: checkState.completedSearches,
      totalSearches: checkState.totalSearches,
    });
  }

  // Check if completed all searches
  const finalState = activeSessions.get(sessionId);
  if (finalState && finalState.completedSearches >= finalState.totalSearches) {
    finalState.status = "completed";
    activeSessions.set(sessionId, finalState);

    io.emit("session:complete", {
      sessionId,
      totalPoints: finalState.pointsEarned,
      totalSearches: finalState.totalSearches,
    });

    io.emit("session:status", {
      sessionId,
      status: "completed",
      completedSearches: finalState.completedSearches,
      totalSearches: finalState.totalSearches,
    });
  }
}

console.log("WebSocket service running on port 3003");
