import express from "express";
import pool from "../config/db.js";

const router = express.Router();

// ── Auth middleware ──────────────────────────────────────────────────────────

function requireAdminToken(req, res, next) {
  const token = req.headers["x-admin-token"];
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    console.error("❌ ADMIN_TOKEN environment variable is not set");
    return res.status(500).json({
      status: "error",
      message: "Server misconfiguration: ADMIN_TOKEN is not set",
    });
  }

  if (!token || token !== expected) {
    return res.status(401).json({
      status: "unauthorized",
      message: "Invalid or missing x-admin-token header",
    });
  }

  next();
}

// ── GET /admin/db/check ──────────────────────────────────────────────────────

router.get("/db/check", requireAdminToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS server_time");
    return res.status(200).json({
      status: "ok",
      message: "Database connection successful",
      serverTime: result.rows[0].server_time,
    });
  } catch (err) {
    console.error("❌ /admin/db/check error:", err.message);
    return res.status(500).json({
      status: "error",
      message: "Database connection failed",
      detail: err.message,
    });
  }
});

// ── POST /admin/db/sample ────────────────────────────────────────────────────

router.post("/db/sample", requireAdminToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure sample tables exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS sample_accounts (
        id          SERIAL PRIMARY KEY,
        account_no  VARCHAR(20)    NOT NULL UNIQUE,
        holder_name VARCHAR(100)   NOT NULL,
        balance     NUMERIC(15, 2) NOT NULL DEFAULT 0,
        currency    CHAR(3)        NOT NULL DEFAULT 'GBP',
        created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sample_transactions (
        id             SERIAL PRIMARY KEY,
        account_no     VARCHAR(20)    NOT NULL,
        type           VARCHAR(20)    NOT NULL,
        amount         NUMERIC(15, 2) NOT NULL,
        description    TEXT,
        transaction_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `);

    // Insert sample accounts (skip duplicates)
    await client.query(`
      INSERT INTO sample_accounts (account_no, holder_name, balance, currency)
      VALUES
        ('ACC-SAMPLE-001', 'Alice Sample',   5000.00, 'GBP'),
        ('ACC-SAMPLE-002', 'Bob Sample',    12500.50, 'GBP'),
        ('ACC-SAMPLE-003', 'Carol Sample',   3200.75, 'USD')
      ON CONFLICT (account_no) DO NOTHING
    `);

    // Insert sample transactions
    await client.query(`
      INSERT INTO sample_transactions (account_no, type, amount, description)
      VALUES
        ('ACC-SAMPLE-001', 'credit', 1000.00, 'Sample salary credit'),
        ('ACC-SAMPLE-001', 'debit',   250.00, 'Sample utility payment'),
        ('ACC-SAMPLE-002', 'credit', 5000.00, 'Sample investment return'),
        ('ACC-SAMPLE-002', 'debit',   800.00, 'Sample rent payment'),
        ('ACC-SAMPLE-003', 'credit',  750.00, 'Sample freelance income')
    `);

    await client.query("COMMIT");

    return res.status(200).json({
      status: "ok",
      message: "Sample data inserted successfully",
      inserted: {
        accounts: 3,
        transactions: 5,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ /admin/db/sample error:", err.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to insert sample data",
      detail: err.message,
    });
  } finally {
    client.release();
  }
});

// ── POST /admin/db/seed-uk ───────────────────────────────────────────────────

router.post("/db/seed-uk", requireAdminToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure UK seed tables exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS uk_accounts (
        id          SERIAL PRIMARY KEY,
        sort_code   CHAR(8)        NOT NULL,
        account_no  CHAR(8)        NOT NULL,
        holder_name VARCHAR(100)   NOT NULL,
        balance     NUMERIC(15, 2) NOT NULL DEFAULT 0,
        account_type VARCHAR(30)   NOT NULL DEFAULT 'current',
        created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        UNIQUE (sort_code, account_no)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS uk_transactions (
        id             SERIAL PRIMARY KEY,
        sort_code      CHAR(8)        NOT NULL,
        account_no     CHAR(8)        NOT NULL,
        type           VARCHAR(20)    NOT NULL,
        amount         NUMERIC(15, 2) NOT NULL,
        reference      VARCHAR(100),
        transaction_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `);

    // Insert UK seed accounts (skip duplicates)
    await client.query(`
      INSERT INTO uk_accounts (sort_code, account_no, holder_name, balance, account_type)
      VALUES
        ('20-00-00', '12345678', 'James Hargreaves',  8500.00, 'current'),
        ('30-00-00', '87654321', 'Sophie Whitfield', 22000.00, 'savings'),
        ('40-47-84', '11223344', 'Oliver Bennett',    4750.50, 'current'),
        ('60-16-13', '99887766', 'Emma Thornton',    15300.25, 'isa'),
        ('77-99-11', '55443322', 'Liam Patel',        2100.00, 'current')
      ON CONFLICT (sort_code, account_no) DO NOTHING
    `);

    // Insert UK seed transactions
    await client.query(`
      INSERT INTO uk_transactions (sort_code, account_no, type, amount, reference)
      VALUES
        ('20-00-00', '12345678', 'credit', 2500.00, 'BACS SALARY APRIL'),
        ('20-00-00', '12345678', 'debit',   950.00, 'DIRECT DEBIT MORTGAGE'),
        ('20-00-00', '12345678', 'debit',   120.00, 'COUNCIL TAX'),
        ('30-00-00', '87654321', 'credit', 5000.00, 'ISA TRANSFER IN'),
        ('40-47-84', '11223344', 'credit', 1800.00, 'FASTER PAYMENT RECEIVED'),
        ('40-47-84', '11223344', 'debit',   300.00, 'STANDING ORDER SAVINGS'),
        ('60-16-13', '99887766', 'credit',  450.00, 'INTEREST PAYMENT'),
        ('77-99-11', '55443322', 'debit',   200.00, 'CONTACTLESS PAYMENT'),
        ('77-99-11', '55443322', 'credit', 1200.00, 'CHAPS PAYMENT RECEIVED')
    `);

    await client.query("COMMIT");

    return res.status(200).json({
      status: "ok",
      message: "UK seed data inserted successfully",
      inserted: {
        accounts: 5,
        transactions: 9,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ /admin/db/seed-uk error:", err.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to insert UK seed data",
      detail: err.message,
    });
  } finally {
    client.release();
  }
});

export default router;
