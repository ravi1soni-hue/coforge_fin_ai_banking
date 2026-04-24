// Keeps Neon Postgres compute warm by running a lightweight query every 4 minutes
// Run this at server startup
import { db } from "./db.js";
function keepDbWarm() {
    setInterval(async () => {
        try {
            await db.selectFrom('users').select('id').limit(1).execute();
            console.log('[DB Heartbeat] Sent keepalive query to Neon Postgres');
        }
        catch (err) {
            console.warn('[DB Heartbeat] Keepalive query failed:', err?.message || err);
        }
    }, 240_000); // 4 minutes
}
export default keepDbWarm;
