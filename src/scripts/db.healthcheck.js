import "dotenv/config";
import { Client } from "pg";

const run = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    const t0 = Date.now();
    await client.connect();
    const res = await client.query("SELECT NOW() AS now, current_database() AS db");
    console.log("DB_CONNECTED", {
      ms: Date.now() - t0,
      now: res.rows[0].now,
      db: res.rows[0].db,
    });
    process.exitCode = 0;
  } catch (error) {
    console.error("DB_CONNECT_ERROR", error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
};

run();
