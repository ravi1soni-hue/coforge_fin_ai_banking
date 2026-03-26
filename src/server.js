import http from "http";
import "./config/db.js";

import app from "./app.js";

import { ENV, validateEnv } from "./config/env.js";

import { initWebSocket } from "./sockets/socket.js";


import ingestionRoutes from "./routes/ingestion.route.js";

 
// Validate env before starting
validateEnv();

console.log("========================================");
console.log("🚀 COFORGE FIN-AI SERVER STARTING");
console.log(`📍 Environment: ${ENV.NODE_ENV}`);
console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
console.log("========================================");

const server = http.createServer(app);

app.use("/api", ingestionRoutes);
 
// Initialize WebSocket
initWebSocket(server);

// Start server
server.listen(ENV.PORT, () => {
  console.log(`🚀 Server running on port ${ENV.PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception:", err);
  process.exit(1);
});
 