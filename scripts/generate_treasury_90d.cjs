const fs = require('fs');
const path = require('path');

const userId = '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1';
const end = new Date('2026-04-13T00:00:00Z');
const days = 90;
const records = [];
const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const baseByDow = {
  1: { inflow: 320000, outflow: 420000, supplier: 250000, payroll: 0 },
  2: { inflow: 620000, outflow: 520000, supplier: 330000, payroll: 0 },
  3: { inflow: 650000, outflow: 600000, supplier: 380000, payroll: 0 },
  4: { inflow: 630000, outflow: 560000, supplier: 350000, payroll: 0 },
  5: { inflow: 380000, outflow: 1650000, supplier: 220000, payroll: 1450000 },
  6: { inflow: 180000, outflow: 140000, supplier: 70000, payroll: 0 },
  0: { inflow: 120000, outflow: 80000, supplier: 30000, payroll: 0 }
};

const lateDates = new Set(['2026-03-24', '2026-04-02']);
let closingBalance = 4_800_000;

for (let i = days - 1; i >= 0; i--) {
  const d = new Date(end);
  d.setUTCDate(end.getUTCDate() - i);
  const iso = d.toISOString().slice(0, 10);
  const dow = d.getUTCDay();
  const base = baseByDow[dow];

  const wave = ((i * 37) % 9) - 4;
  const inflowAdj = 1 + wave * 0.008;
  const outflowAdj = 1 + ((8 - wave) * 0.006 - 0.02);

  let totalInflows = Math.round(base.inflow * inflowAdj);
  const totalOutflows = Math.round(base.outflow * outflowAdj);
  const payrollOutflow = base.payroll;
  const supplierOutflow = Math.round(base.supplier * outflowAdj);

  let receiptPunctuality = 'ON_TIME';
  if (lateDates.has(iso)) {
    receiptPunctuality = 'LATE';
    totalInflows = Math.round(totalInflows * 0.68);
  }

  closingBalance += totalInflows - totalOutflows;

  records.push({
    id: `cf90-${iso}`,
    user_id: userId,
    business_date: iso,
    day_name: dayNames[dow],
    total_inflows: totalInflows,
    total_outflows: totalOutflows,
    payroll_outflow: payrollOutflow,
    supplier_outflow: supplierOutflow,
    closing_balance: Math.round(closingBalance),
    currency: 'GBP',
    metadata: {
      receiptPunctuality,
      source: 'synthetic_uk_treasury_90d',
      generatedFor: 'conversational_confidence'
    }
  });
}

const out = {
  dataset: 'uk_treasury_cashflow_90_days',
  version: '1.0.0',
  user_id: userId,
  start_date: records[0].business_date,
  end_date: records[records.length - 1].business_date,
  days: records.length,
  assumptions: {
    target_weekly_outflow_baseline: 3600000,
    target_midweek_inflow_baseline_tue_to_thu: 1900000,
    payroll_day: 'FRIDAY',
    late_inflow_events_last_4_weeks: 2
  },
  treasury_cashflow_daily: records
};

const outPath = path.join(process.cwd(), 'docs', 'uk_treasury_cashflow_90_days.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`WROTE ${outPath} records=${records.length}`);
