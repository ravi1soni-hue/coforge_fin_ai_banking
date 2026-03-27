import express from "express";
import pool from "../config/db.js";
import { seedUkFinancialDataToPostgres } from "../services/postgres.seed.service.js";

const router = express.Router();

const requireAdminToken = (req, res, next) => {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) {
    return res.status(503).json({
      ok: false,
      error: "ADMIN_TOKEN is not configured",
    });
  }

  const incoming = req.headers["x-admin-token"];
  if (incoming !== configured) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
};

router.get("/db/check", requireAdminToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now, current_database() AS db");
    return res.status(200).json({
      ok: true,
      now: result.rows[0].now,
      database: result.rows[0].db,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/db/sample", requireAdminToken, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seed_probe (
        id SERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const inserted = await pool.query(
      "INSERT INTO seed_probe(label) VALUES($1) RETURNING id, label, created_at",
      ["db-sample-ok"]
    );
    const count = await pool.query("SELECT COUNT(*)::int AS c FROM seed_probe");

    return res.status(200).json({
      ok: true,
      inserted: inserted.rows[0],
      totalRows: count.rows[0].c,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/db/seed-uk", requireAdminToken, async (req, res) => {
  try {
    const result = await seedUkFinancialDataToPostgres();
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
