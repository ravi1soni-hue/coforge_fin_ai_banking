"use strict";
require("dotenv").config();
const { Client } = require("pg");

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  await c.connect();

  // 1. FK constraints
  console.log("\n=== FOREIGN KEY CONSTRAINTS ===");
  const fks = await c.query(`
    SELECT
      tc.table_name AS from_table,
      kcu.column_name AS from_col,
      ccu.table_name AS to_table,
      ccu.column_name AS to_col,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = rc.unique_constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name
  `);
  fks.rows.forEach((r) =>
    console.log(
      `  ${r.from_table}.${r.from_col}  →  ${r.to_table}.${r.to_col}  [ON DELETE ${r.delete_rule}]`
    )
  );

  // 2. PK / UNIQUE keys
  console.log("\n=== PRIMARY / UNIQUE KEYS ===");
  const pks = await c.query(`
    SELECT tc.table_name, tc.constraint_type, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_type
  `);
  pks.rows.forEach((r) =>
    console.log(
      `  ${r.table_name.padEnd(35)} [${r.constraint_type}]  ${r.column_name}`
    )
  );

  // 3. FK integrity check — orphan rows
  console.log("\n=== FK INTEGRITY CHECK (orphan rows) ===");
  const checks = [
    { child: "account_balances", col: "user_id", parent: "users" },
    { child: "loan_accounts", col: "user_id", parent: "users" },
    { child: "investment_summary", col: "user_id", parent: "users" },
    { child: "financial_summary_monthly", col: "user_id", parent: "users" },
    { child: "credit_profile", col: "user_id", parent: "users" },
    { child: "financial_data_sync", col: "user_id", parent: "users" },
    { child: "vector_documents", col: "user_id", parent: "users" },
    { child: "messages", col: "sender_id", parent: "users" },
    { child: "graph_state", col: "user_id", parent: "users" },
  ];
  for (const { child, col, parent } of checks) {
    const r = await c.query(
      `SELECT COUNT(*) FROM "${child}" WHERE "${col}" NOT IN (SELECT id FROM "${parent}")`
    );
    const orphans = parseInt(r.rows[0].count);
    console.log(
      `  ${child.padEnd(35)} orphan ${col}: ${orphans === 0 ? "✅ 0" : "❌ " + orphans}`
    );
  }

  // 4. Row counts
  console.log("\n=== ROW COUNTS ===");
  const tables = [
    "users",
    "account_balances",
    "loan_accounts",
    "investment_summary",
    "financial_summary_monthly",
    "credit_profile",
    "financial_data_sync",
    "vector_documents",
    "messages",
    "graph_state",
  ];
  for (const t of tables) {
    const r = await c.query(`SELECT COUNT(*) FROM "${t}"`);
    const count = parseInt(r.rows[0].count);
    const icon = count > 0 ? "✅" : "⬜";
    console.log(`  ${icon}  ${t.padEnd(33)} ${count} rows`);
  }

  // 5. UUID format spot-check on users.id
  console.log("\n=== UUID FORMAT CHECK (users) ===");
  const uuids = await c.query(
    `SELECT id, external_user_id FROM users`
  );
  uuids.rows.forEach((r) => {
    const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.id);
    console.log(`  ${valid ? "✅" : "❌"} id=${r.id}  external_id=${r.external_user_id}`);
  });

  await c.end();
}

check().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
