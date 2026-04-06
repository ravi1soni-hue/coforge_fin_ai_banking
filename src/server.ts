import http from "http";

import { sql } from 'kysely';

import app from "./app.js";
import { ENV } from "./config/env.js";
import { initWebSocket } from "./sockets/socket.js";

import ingestionRoutes from "./routes/ingestion.route.js";
import { db } from "./db/index.js";
//import { configureLangSmith } from "./config/langsmith.config.js";

//configureLangSmith();

const server = http.createServer(app);

async function start() {
  try {
    console.log("⏳ Checking database connection...");
  
// Correct Kysely syntax for raw SQL execution
await sql`SELECT 1`.execute(db); 

    console.log("✅ Database connected");

    

app.use("/api", ingestionRoutes);
 
// Initialize WebSocket
    initWebSocket(server);
    server.listen(ENV.PORT, () => {
      console.log(`🚀 Server running on port ${ENV.PORT}`);
    });
  } catch (err) {
    console.error("❌ Database startup failed");
    console.error(err);
    process.exit(1);
  }
}


start();