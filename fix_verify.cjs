"use strict";
require("dotenv").config();
const { Client } = require("pg");

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
    try {
        console.log("Connecting...");
        await c.connect();
        console.log("Connected.");

        const u = await c.query(
            "SELECT id, external_user_id, full_name FROM users WHERE LOWER(TRIM(external_user_id)) = $1",
            ["uk_user_001"]
        );

        if (!u.rows[0]) {
            console.log("❌ uk_user_001 NOT found in DB");
            await c.end();
            return;
        }

        const user = u.rows[0];
        console.log("✅ User found:");
        console.log("   external_user_id :", user.external_user_id);
  console.log("   internal UUID    :", user.id);
  console.log("   full_name        :", user.full_name);

  const uid = user.id;
  const counts = await c.query(`
    SELECT 'account_balances'        AS tbl, COUNT(*) FROM account_balances        WHERE user_id='${uid}'
    UNION ALL
    SELECT 'loan_accounts',                  COUNT(*) FROM loan_accounts           WHERE user_id='${uid}'
    UNION ALL
    SELECT 'investment_summary',             COUNT(*) FROM investment_summary      WHERE user_id='${uid}'
    UNION ALL
    SELECT 'financial_summary_monthly',      COUNT(*) FROM financial_summary_monthly WHERE user_id='${uid}'
    UNION ALL
    SELECT 'credit_profile',                 COUNT(*) FROM credit_profile          WHERE user_id='${uid}'
    UNION ALL
    SELECT 'vector_documents (active)',       COUNT(*) FROM vector_documents       WHERE user_id='${uid}' AND is_active=true
  `);

  console.log("\n📊 All data linked to uk_user_001:");
  counts.rows.forEach((r) => {
    const icon = parseInt(r.count) > 0 ? "✅" : "❌";
    console.log("  " + icon + "  " + r.tbl.padEnd(35) + " " + r.count + " rows");
  });

  console.log("\n🔗 Flow: Flutter sends userId=uk_user_001");
  console.log("   socket.ts resolves uk_user_001 → UUID", uid);
  console.log("   AI queries vector_documents   WHERE user_id =", uid);
  console.log("   AI queries structured tables  WHERE user_id =", uid);

  await c.end();
    } catch (e) {
        console.error("❌", e.message);
        process.exit(1);
    }
}

run();
