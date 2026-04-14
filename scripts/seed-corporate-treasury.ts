// Pure Node.js seeder for corporate treasury data

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Inline UUID checker for use below
  function isUUID(str: string): boolean {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  }
  const seedPath = path.join(__dirname, '../seed/corporate_treasury_seed.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  // User
  const user = seed.user;
  await db
    .insertInto('users')
    .values({
      id: user.id,
      external_user_id: user.external_user_id,
      full_name: user.full_name,
      country_code: user.country_code,
      base_currency: user.base_currency,
      timezone: user.timezone,
      status: user.status,
      metadata: user.metadata,
    })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();

  // Only seed corporate/treasury tables below.

  // Accounts
  for (const acct of seed.accounts) {
    let id = acct.id;
    if (!isUUID(id)) {
      // Generate a deterministic UUID based on user_id + account_ref for idempotency
      if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
        id = globalThis.crypto.randomUUID();
      } else {
        // fallback: simple hash
        id = Buffer.from(`${user.id}-${acct.account_ref}`).toString('hex').slice(0, 36);
      }
    }
    await db
      .insertInto('account_balances')
      .values({
        id,
        user_id: acct.user_id,
        account_type: acct.account_type,
        provider: acct.provider,
        account_ref: acct.account_ref,
        balance: acct.balance,
        currency: acct.currency,
        metadata: {},
        updated_at: String(Date.now()),
      })
      .onConflict((oc) => oc.columns(['user_id', 'account_ref']).doNothing())
      .execute();
  }

  // Treasury Cashflow Daily
  for (const row of seed.treasury_cashflow_daily) {
    let id = row.id || `${user.id}-${row.business_date}`;
    if (!isUUID(id)) {
      if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
        id = globalThis.crypto.randomUUID();
      } else {
        id = Buffer.from(`${user.id}-${row.business_date}`).toString('hex').slice(0, 36);
      }
    }
    await db
      .insertInto('treasury_cashflow_daily')
      .values({
        id,
        user_id: user.id,
        business_date: row.business_date,
        day_name: row.day_name,
        total_inflows: row.total_inflows,
        total_outflows: row.total_outflows,
        payroll_outflow: row.payroll_outflow,
        supplier_outflow: row.supplier_outflow,
        closing_balance: row.closing_balance,
        currency: row.currency,
        metadata: {},
        created_at: String(Date.now()),
        updated_at: String(Date.now()),
      })
      .onConflict((oc) => oc.columns(['user_id', 'business_date']).doNothing())
      .execute();
  }

  // Treasury Decision Snapshots
  if (seed.treasury_decision_snapshots) {
    for (const snap of seed.treasury_decision_snapshots) {
      let id = snap.id || `${user.id}-${snap.snapshot_date}`;
      if (!isUUID(id)) {
        if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
          id = globalThis.crypto.randomUUID();
        } else {
          id = Buffer.from(`${user.id}-${snap.snapshot_date}`).toString('hex').slice(0, 36);
        }
      }
      await db
        .insertInto('treasury_decision_snapshots')
        .values({
          id,
          user_id: user.id,
          snapshot_date: snap.snapshot_date,
          weekly_outflow_baseline: snap.weekly_outflow_baseline,
          midweek_inflow_baseline: snap.midweek_inflow_baseline,
          late_inflow_count_last_4_weeks: snap.late_inflow_count_last_4_weeks,
          comfort_threshold: snap.comfort_threshold,
          min_inflow_for_midweek_release: snap.min_inflow_for_midweek_release,
          release_condition_hit_rate_10_weeks: snap.release_condition_hit_rate_10_weeks,
          currency: snap.currency,
          metadata: {},
          created_at: String(Date.now()),
          updated_at: String(Date.now()),
        })
        .onConflict((oc) => oc.columns(['user_id', 'snapshot_date']).doNothing())
        .execute();
    }
  }

  // Treasury Supplier Payment Candidates
  if (seed.treasury_supplier_payment_candidates) {
    for (const supp of seed.treasury_supplier_payment_candidates) {
      let id = supp.id || `${user.id}-${supp.supplier_ref}`;
      if (!isUUID(id)) {
        if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
          id = globalThis.crypto.randomUUID();
        } else {
          id = Buffer.from(`${user.id}-${supp.supplier_ref}`).toString('hex').slice(0, 36);
        }
      }
      await db
        .insertInto('treasury_supplier_payment_candidates')
        .values({
          id,
          user_id: user.id,
          supplier_ref: supp.supplier_ref,
          supplier_name: supp.supplier_name,
          amount: supp.amount,
          currency: supp.currency,
          urgency: supp.urgency,
          due_date: supp.due_date,
          batch_hint: supp.batch_hint,
          metadata: {},
          created_at: String(Date.now()),
          updated_at: String(Date.now()),
        })
        .onConflict((oc) => oc.column('id').doNothing())
        .execute();
    }
  }

  console.log('Corporate treasury seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
