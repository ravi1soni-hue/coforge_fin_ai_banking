import express from "express";

import cors from "cors";

import healthRoutes from "./routes/health.route.js";
 
const app = express();


// Serve UI
app.use(express.static("public"));

 
app.use(cors());

app.use(express.json());

// Health check endpoint
app.use("/health", healthRoutes);

// Dashboard route
app.get("/", (req, res) => {
  res.sendFile("public/dashboard.html", { root: "." });
});
 
export default app;
 