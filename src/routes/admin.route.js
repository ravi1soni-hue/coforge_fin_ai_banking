import express from "express";
import pool from "../config/db.js";

const router = express.Router();

// ── Authentication middleware ──────────────────────────────────────────────────
function requireAdminToken(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!token) {
    return res.status(401).json({ error: "Missing x-admin-token header" });
  }

  if (!process.env.ADMIN_TOKEN) {
    console.error("❌ ADMIN_TOKEN env var is not set");
    return res.status(500).json({ error: "Admin token not configured on server" });
  }

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Invalid admin token" });
  }

  next();
}

// Apply auth middleware to all routes in this router
router.use(requireAdminToken);

// ── GET /admin/db/check ────────────────────────────────────────────────────────
router.get("/db/check", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.status(200).json({
      status: "connected",
      timestamp: result.rows[0].now,
    });
  } catch (err) {
    console.error("❌ DB check failed:", err.message);
    res.status(500).json({
      status: "error",
      error: err.message,
    });
  }
});

// ── POST /admin/db/sample ──────────────────────────────────────────────────────
router.post("/db/sample", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sample_transactions (
        id          SERIAL PRIMARY KEY,
        account_id  VARCHAR(50)    NOT NULL,
        amount      NUMERIC(12, 2) NOT NULL,
        currency    VARCHAR(3)     NOT NULL DEFAULT 'GBP',
        description TEXT,
        created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      INSERT INTO sample_transactions (account_id, amount, currency, description)
      VALUES
        ('ACC-001', 1500.00, 'GBP', 'Sample salary payment'),
        ('ACC-002',  250.75, 'GBP', 'Sample utility bill'),
        ('ACC-003',   89.99, 'GBP', 'Sample subscription charge'),
        ('ACC-001',  -45.00, 'GBP', 'Sample ATM withdrawal'),
        ('ACC-002', 3200.00, 'GBP', 'Sample business transfer')
    `);

    res.status(200).json({
      success: true,
      message: "Sample data added",
    });
  } catch (err) {
    console.error("❌ Sample data insert failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ── POST /admin/db/seed-uk ─────────────────────────────────────────────────────
router.post("/db/seed-uk", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS uk_financial_data (
        id            SERIAL PRIMARY KEY,
        institution   VARCHAR(100)   NOT NULL,
        product_type  VARCHAR(50)    NOT NULL,
        interest_rate NUMERIC(5, 2),
        region        VARCHAR(50)    NOT NULL DEFAULT 'UK',
        created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      INSERT INTO uk_financial_data (institution, product_type, interest_rate, region)
      VALUES
        ('Barclays',        'Current Account',  0.10, 'UK'),
        ('HSBC',            'Savings Account',  3.50, 'UK'),
        ('Lloyds Bank',     'ISA',              4.20, 'UK'),
        ('NatWest',         'Mortgage',         5.75, 'UK'),
        ('Nationwide',      'Fixed Bond',       5.10, 'UK'),
        ('Santander UK',    'Current Account',  0.00, 'UK'),
        ('Halifax',         'Help to Buy ISA',  3.25, 'UK'),
        ('Monzo',           'Current Account',  0.00, 'UK'),
        ('Starling Bank',   'Current Account',  3.25, 'UK'),
        ('Metro Bank',      'Savings Account',  4.75, 'UK')
    `);

    res.status(200).json({
      success: true,
      message: "UK data seeded",
    });
  } catch (err) {
    console.error("❌ UK seed data insert failed:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
