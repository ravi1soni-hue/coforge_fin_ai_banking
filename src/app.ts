import express from "express";

import cors from "cors";

import healthRoutes from "./routes/health.route.js";
 
const app = express();


// Serve UI
app.use(express.static("src/public"));

 
app.use(cors());

app.use(express.json());
 
app.use("/health", healthRoutes);
 
export default app;
 