import express from "express";

import cors from "cors";

import healthRoutes from "./routes/health.route.js";
 
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

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(err.status || 500).json({
    error: err.message,
    status: err.status || 500
  });
});
 
export default app;
 