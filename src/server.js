import http from "http";
import "./config/db.js";

import app from "./app.js";

import { ENV } from "./config/env.js";

import { initWebSocket } from "./sockets/socket.js";

import { testDb } from "./utils/testDb.js";


import ingestionRoutes from "./routes/ingestion.route.js";

 
const server = http.createServer(app);



app.use("/api", ingestionRoutes);
 
// Initialize WebSocket
initWebSocket(server);
 
server.listen(ENV.PORT, () => {

  console.log(`🚀 Server running on port ${ENV.PORT}`);

});
 