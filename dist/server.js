import http from "http";
import { db } from "./db.js";
import app from "./app.js";
import { ENV } from "./config/env.js";
import { initWebSocket } from "./sockets/socket.js";
import { bootstrapBankingUserVectors } from "./services/bankingUserVector.bootstrap.js";
import { syncUserFinancialProfiles } from "./services/financialProfilesSync.js";
import ingestionRoutes from "./routes/ingestion.route.js";
//import { configureLangSmith } from "./config/langsmith.config.js";
//configureLangSmith();
const server = http.createServer(app);
// ⚡ Railway aggressive keep-alive (Railway terminates idle connections after ~15-20s)
server.keepAliveTimeout = 10000; // 10s keep-alive
server.headersTimeout = 11000; // 11s headers timeout
server.requestTimeout = 0; // No global request timeout
app.use("/api", ingestionRoutes);
// Initialize WebSocket FIRST - must be ready before server starts
initWebSocket(server);
async function start() {
    try {
        console.log("⏳ Bootstrapping banking user vectors...");
        await bootstrapBankingUserVectors();
        console.log("✅ Banking vectors loaded");
        console.log("⏳ Syncing financial profiles...");
        await syncUserFinancialProfiles(db);
        console.log("✅ Financial profiles synced");
        server.listen(ENV.PORT, () => {
            console.log(`🚀 Server running on port ${ENV.PORT}`);
            console.log(`📡 WebSocket ready at wss://coforgefinaibanking-development-ebdd.up.railway.app/ws`);
        });
    }
    catch (err) {
        console.error("❌ Startup failed");
        console.error(err);
        process.exit(1);
    }
}
start();
