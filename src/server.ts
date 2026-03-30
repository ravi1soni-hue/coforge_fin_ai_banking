import http from "http";
import { db } from "./db.js";

import app from "./app.js";
import { ENV } from "./config/env.js";
import { initWebSocket } from "./sockets/socket.js";

import ingestionRoutes from "./routes/ingestion.route.js";
//import { configureLangSmith } from "./config/langsmith.config.js";

//configureLangSmith();

const server = http.createServer(app);

async function start() {
  try {
    //console.log("⏳ Checking database connection...");
    //await db.selectFrom("users").selectAll().execute();

    //console.log("✅ Database connected");

    

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