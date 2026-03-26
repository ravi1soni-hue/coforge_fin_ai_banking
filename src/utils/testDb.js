import pool from "../config/db.js";

export async function testDb() {
  const res = await pool.query("SELECT NOW()");
  console.log("🕒 DB Time:", res.rows[0]);
}