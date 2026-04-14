import { Pool } from "pg";

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  try {
    const res = await pool.query("SELECT id, external_user_id, full_name, status, metadata FROM users WHERE external_user_id = 'corp-northstar-001' OR external_user_id = 'uk_user_001';");
    console.log("=== USERS TABLE (corp-northstar-001 & uk_user_001) ===");
    for (const row of res.rows) {
      console.log(JSON.stringify(row, null, 2));
    }
  } catch (err) {
    console.error("DB query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
