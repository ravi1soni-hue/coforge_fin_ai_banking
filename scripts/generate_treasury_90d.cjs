// Generates 90 days of synthetic treasury cashflow, supplier, and snapshot data for a corporate user
const fs = require('fs');
const path = require('path');

const USER_ID = '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1';
const SEED_PATH = path.join(__dirname, '../seed/corporate_treasury_seed.json');

function randomBetween(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

function generateCashflow(startDate, days) {
  const cashflow = [];
  let closing = 4800000;
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });
    const payroll = dayName === 'Friday' ? randomBetween(180000, 220000) : 0;
    const inflow = randomBetween(120000, 220000);
    const outflow = randomBetween(180000, 260000) + payroll;
    const supplier = randomBetween(50000, 120000);
    closing += inflow - outflow;
    cashflow.push({
      business_date: date.toISOString().slice(0, 10),
      day_name: dayName,
      total_inflows: inflow,
      total_outflows: outflow,
      payroll_outflow: payroll,
      supplier_outflow: supplier,
      closing_balance: Math.max(closing, 0),
      currency: 'GBP'
    });
  }
  return cashflow;
}

function generateSnapshots(cashflow) {
  // Weekly snapshots
  const snapshots = [];
  for (let i = 0; i < cashflow.length; i += 7) {
    const week = cashflow.slice(i, i + 7);
    if (week.length < 7) break;
    const inflow = week.reduce((sum, d) => sum + d.total_inflows, 0);
    const outflow = week.reduce((sum, d) => sum + d.total_outflows, 0);
    const late = randomBetween(0, 2);
    snapshots.push({
      snapshot_date: week[0].business_date,
      weekly_outflow_baseline: outflow,
      midweek_inflow_baseline: Math.round(inflow / 2),
      late_inflow_count_last_4_weeks: late,
      comfort_threshold: randomBetween(900000, 1200000),
      min_inflow_for_midweek_release: randomBetween(50000, 120000),
      release_condition_hit_rate_10_weeks: Math.random().toFixed(2),
      currency: 'GBP'
    });
  }
  return snapshots;
}

function generateSuppliers(days) {
  // 2-4 suppliers per week, some urgent, some deferable
  const suppliers = [];
  const supplierNames = ['Acme Steel', 'Global Plastics', 'UK Freight', 'EuroChem', 'OfficePro', 'TechSource', 'LogiTrans', 'BritEnergy'];
  for (let i = 0; i < days; i += 7) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - days + i);
    for (let j = 0; j < randomBetween(2, 4); j++) {
      suppliers.push({
        supplier_ref: `SUPP-${i}-${j}`,
        supplier_name: supplierNames[randomBetween(0, supplierNames.length - 1)],
        amount: randomBetween(50000, 250000),
        currency: 'GBP',
        urgency: Math.random() > 0.5 ? 'URGENT' : 'DEFERABLE',
        due_date: new Date(weekStart.getTime() + randomBetween(0, 6) * 86400000).toISOString().slice(0, 10),
        batch_hint: null,
        metadata: {}
      });
    }
  }
  return suppliers;
}

function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 89);
  seed.treasury_cashflow_daily = generateCashflow(startDate, 90);
  seed.treasury_decision_snapshots = generateSnapshots(seed.treasury_cashflow_daily);
  seed.treasury_supplier_payment_candidates = generateSuppliers(90);
  fs.writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));
  console.log('Seeded 90 days of treasury data for user', USER_ID);
}

main();
