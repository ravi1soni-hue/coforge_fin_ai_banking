import express from "express";

import cors from "cors";

import healthRoutes from "./routes/health.route.js";
import adminRoutes from "./routes/admin.route.js";
import { websocketsReady, getActiveConnectionCount } from "./sockets/socket.js";

const app = express();
 
app.use(cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});
 
app.use("/health", healthRoutes);

app.get("/ws-status", (req, res) => {
  res.status(200).json({
    websocketsReady,
    activeConnections: getActiveConnectionCount(),
  });
});

// Version / deployment diagnostics endpoint
app.get("/version", (req, res) => {
  res.status(200).json({
    service: "fin-ai-assistance-server",
    version: process.env.npm_package_version || "unknown",
    commit: process.env.COMMIT_SHA || "unknown",
    nodeEnv: process.env.NODE_ENV || "unknown",
    timestamp: new Date().toISOString(),
  });
});

app.use("/admin", adminRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(err.status || 500).json({
    error: err.message,
    status: err.status || 500
  });
});
 
export default app;
 