import http from "http";
import { db } from "./db.js";

import app from "./app.js";
import { ENV } from "./config/env.js";
import { initWebSocket } from "./sockets/socket.js";
import { bootstrapBankingUserVectors } from "./services/bankingUserVector.bootstrap.js";


import ingestionRoutes from "./routes/ingestion.route.js";
//import { configureLangSmith } from "./config/langsmith.config.js";

//configureLangSmith();

const server = http.createServer(app);

// ⚡ Railway keep-alive — must exceed Railway's 15-20s idle timeout
server.keepAliveTimeout = 60000;    // 60s keep-alive (well above Railway's ~15-20s idle cutoff)
server.headersTimeout = 65000;       // 65s headers timeout (must be > keepAliveTimeout)
server.requestTimeout = 0;           // No global request timeout

// ⚡ 120s socket timeout for long-lived WebSocket connections
(server as any).setTimeout(120000);

app.use("/api", ingestionRoutes);

// Initialize WebSocket FIRST - must be ready before server starts
initWebSocket(server);

async function start() {
  try {
    // ⚡ Start server IMMEDIATELY - don't wait for bootstrap
    server.listen(ENV.PORT, () => {
      console.log(`🚀 Server running on port ${ENV.PORT}`);
      console.log(`📡 WebSocket ready at wss://coforgefinaibanking-development-ebdd.up.railway.app/ws`);
    });

    // 🔄 Run bootstrap in background - non-blocking
    bootstrapAndSync();
  } catch (err) {
    console.error("❌ Server startup failed");
    console.error(err);
    process.exit(1);
  }
}

async function bootstrapAndSync() {
  // Bootstrapping disabled by request: DB already seeded, skip vector/user bootstrap
  // If needed, re-enable the following lines:
  // console.log("⏳ Bootstrapping banking user vectors...");
  // await bootstrapBankingUserVectors();
  // console.log("✅ Banking vectors loaded");
  // console.log("⏳ Syncing financial profiles...");
  // console.log("✅ Financial profiles synced");
  return;
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("⚠️  SIGTERM received — starting graceful shutdown");

  // Stop accepting new connections
  server.close(() => {
    console.log("✅ HTTP server closed — all connections drained");
    process.exit(0);
  });

  // Force-exit after 10s if connections haven't drained
  setTimeout(() => {
    console.error("❌ Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000).unref();
});

// ─── Safety nets for unhandled errors ────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:", reason);
  process.exit(1);
});

start();