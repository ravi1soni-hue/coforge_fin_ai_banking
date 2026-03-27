import "dotenv/config";
import { seedUkFinancialDataToPostgres } from "../services/postgres.seed.service.js";
import pool from "../config/db.js";

const run = async () => {
  try {
    const result = await seedUkFinancialDataToPostgres();
    console.log("✅ Seed completed:", result);
    process.exitCode = 0;
  } catch (error) {
    console.error("❌ Seed failed:", error?.message || error);
    if (error?.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
