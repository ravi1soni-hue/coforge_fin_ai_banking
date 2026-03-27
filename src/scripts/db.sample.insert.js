import "dotenv/config";
import { Client } from "pg";

const run = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });

  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS seed_probe (
        id SERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const inserted = await client.query(
      "INSERT INTO seed_probe(label) VALUES($1) RETURNING id, label, created_at",
      ["db-sample-ok"]
    );

    const count = await client.query("SELECT COUNT(*)::int AS c FROM seed_probe");
    console.log("DB_SAMPLE_INSERT_OK", {
      inserted: inserted.rows[0],
      totalRows: count.rows[0].c,
    });
    process.exitCode = 0;
  } catch (error) {
    console.error("DB_SAMPLE_INSERT_ERROR", error.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
};

run();
