// One-off seed script — run with: node src/scripts/seed-db.cjs
// Reads banking_user_data.json and populates all DB tables.
"use strict";

require("dotenv").config();
const { Client } = require("pg");
const { v4: uuidv4 } = require("uuid");
const d = require("../../banking_user_data.json");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function seed() {
  await client.connect();
  console.log("✅ DB connected");

  // ── 1. users ──────────────────────────────────────────────────────────────
  const userId = uuidv4();
  await client.query(
    `INSERT INTO users (id, external_user_id, full_name, country_code, base_currency, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())
     ON CONFLICT (external_user_id) DO UPDATE SET full_name=EXCLUDED.full_name, updated_at=NOW()`,
    [
      userId,
      d.userProfile.userId,
      d.userProfile.name,
      d.userProfile.country ?? "UK",
      d.userProfile.currency ?? "GBP",
    ]
  );
  // Fetch the actual UUID (in case ON CONFLICT hit and we need the existing id)
  const userRow = await client.query(
    `SELECT id FROM users WHERE external_user_id = $1`,
    [d.userProfile.userId]
  );
  const dbUserId = userRow.rows[0].id;
  console.log(`✅ users — external_id=${d.userProfile.userId}  uuid=${dbUserId}`);

  // ── 2. account_balances ───────────────────────────────────────────────────
  for (const acc of d.accounts ?? []) {
    await client.query(
      `INSERT INTO account_balances (id, user_id, account_type, provider, account_ref, balance, currency, metadata, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(), dbUserId,
        acc.type, acc.bank, acc.accountId,
        acc.balance,
        d.userProfile.currency ?? "GBP",
        JSON.stringify({ averageMonthlyBalance: acc.averageMonthlyBalance ?? null }),
        Date.now(),
      ]
    );
  }
  console.log(`✅ account_balances — ${d.accounts?.length ?? 0} rows`);

  // ── 3. loan_accounts ─────────────────────────────────────────────────────
  for (const loan of d.loans ?? []) {
    const approxPrincipal = (loan.emi ?? 0) * (loan.remainingTenureMonths ?? 0);
    await client.query(
      `INSERT INTO loan_accounts (id, user_id, loan_type, provider, principal_amount, outstanding_amount, interest_rate, emi_amount, tenure_months, status, currency, metadata, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12)
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(), dbUserId,
        loan.type, loan.provider,
        approxPrincipal, approxPrincipal,
        null, loan.emi ?? 0,
        loan.remainingTenureMonths ?? 0,
        d.userProfile.currency ?? "GBP",
        JSON.stringify({ loanId: loan.loanId }),
        Date.now(),
      ]
    );
  }
  console.log(`✅ loan_accounts — ${d.loans?.length ?? 0} rows`);

  // ── 4. investment_summary ────────────────────────────────────────────────
  const totalCurrentValue = (d.investments ?? []).reduce(
    (sum, inv) => sum + (inv.currentValue ?? 0), 0
  );
  const monthlyContrib = (d.investments ?? []).reduce(
    (sum, inv) => sum + (inv.monthlyContribution ?? 0), 0
  );
  await client.query(
    `INSERT INTO investment_summary (id, user_id, as_of_month, total_invested, total_current_value, total_unrealized_gain, currency, investment_info, metadata, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT DO NOTHING`,
    [
      uuidv4(), dbUserId,
      new Date().toISOString().slice(0, 7) + "-01",
      totalCurrentValue, totalCurrentValue, 0,
      d.userProfile.currency ?? "GBP",
      JSON.stringify(d.investments),
      JSON.stringify({ monthlyContribution: monthlyContrib }),
      Date.now(),
    ]
  );
  console.log(`✅ investment_summary — currentValue=${totalCurrentValue}`);

  // ── 5. financial_summary_monthly ─────────────────────────────────────────
  const monthlyMap = {};
  for (const tx of d.transactions ?? []) {
    const m = tx.date?.slice(0, 7);
    if (!m) continue;
    if (!monthlyMap[m]) monthlyMap[m] = { income: 0, expenses: 0 };
    if (tx.type === "CREDIT") monthlyMap[m].income += tx.amount ?? 0;
    else monthlyMap[m].expenses += tx.amount ?? 0;
  }
  let monthsInserted = 0;
  for (const [month, v] of Object.entries(monthlyMap)) {
    const net = v.income - v.expenses;
    await client.query(
      `INSERT INTO financial_summary_monthly (id, user_id, month, total_income, total_expenses, total_savings, total_investments, net_cashflow, currency, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING`,
      [
        uuidv4(), dbUserId,
        month + "-01",
        v.income, v.expenses,
        Math.max(net, 0), monthlyContrib,
        net,
        d.userProfile.currency ?? "GBP",
        JSON.stringify({}),
        Date.now(),
      ]
    );
    monthsInserted++;
  }
  console.log(`✅ financial_summary_monthly — ${monthsInserted} months`);

  // ── 6. credit_profile ────────────────────────────────────────────────────
  await client.query(
    `INSERT INTO credit_profile (user_id, credit_score, score_band, bureau, last_reported_at, metadata)
     VALUES ($1, 720, 'Good', 'Experian', $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET credit_score=EXCLUDED.credit_score, last_reported_at=EXCLUDED.last_reported_at`,
    [
      dbUserId,
      Date.now(),
      JSON.stringify({ source: "seeded", externalUserId: d.userProfile.userId }),
    ]
  );
  console.log("✅ credit_profile — score=720 (Good)");

  // ── 7. financial_data_sync ───────────────────────────────────────────────
  // Seed one COMPLETED sync record representing the initial data load.
  // Status: 1=PENDING, 2=PROCESSING, 3=COMPLETED
  const syncStarted  = Date.now() - 3000; // ~3 s ago
  const syncFinished = Date.now();
  await client.query(
    `INSERT INTO financial_data_sync
       (id, user_id, external_connection_id, status, error_log, started_at, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING`,
    [
      uuidv4(), dbUserId,
      "open-banking-uk-initial",
      3,               // COMPLETED
      null,
      syncStarted,
      syncFinished,
    ]
  );
  console.log("✅ financial_data_sync — 1 row (status=COMPLETED)");

  await client.end();
  console.log("\n🎉 Seed complete!");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
