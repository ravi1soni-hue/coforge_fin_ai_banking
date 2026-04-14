import { Pool } from "pg";

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
  });
  try {
    const res = await pool.query("SELECT id, external_user_id, full_name FROM users;");
    console.log("=== USERS TABLE ===");
    for (const row of res.rows) {
      console.log(`id: ${row.id} | external_user_id: ${row.external_user_id} | full_name: ${row.full_name}`);
    }
  } catch (err) {
    console.error("DB query failed:", err);
  } finally {
    await pool.end();
  }
}

main();
