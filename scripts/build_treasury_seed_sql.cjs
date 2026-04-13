const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const conversationPath = path.join(repoRoot, 'docs', 'uk_treasury_conversation_seed_data.json');
const cashflow90Path = path.join(repoRoot, 'docs', 'uk_treasury_cashflow_90_days.json');
const outPath = path.join(repoRoot, 'scripts', 'seed_treasury_conversation.sql');

const conversation = JSON.parse(fs.readFileSync(conversationPath, 'utf8'));
const cashflow90 = JSON.parse(fs.readFileSync(cashflow90Path, 'utf8'));

const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

const buildInsert = ({ table, columns, rows, conflict }) => {
  const header = `INSERT INTO ${table} (\n  ${columns.join(',\n  ')}\n)\nVALUES\n`;
  const values = rows.map((row) => {
    const line = columns.map((column) => sqlValue(row[column])).join(', ');
    return `(${line})`;
  }).join(',\n');
  return `${header}${values}\n${conflict};\n`;
};

const users = conversation.users.map((user) => ({
  id: user.id,
  external_user_id: user.external_user_id,
  full_name: user.full_name,
  country_code: 'GB',
  base_currency: 'GBP',
  timezone: 'Europe/London',
  status: 1,
  metadata: { segment: 'mid_market', industry: 'retail', isCorporate: true }
}));

const balances = [
  {
    id: '39f3a6d4-7b7a-4f2b-b2f3-b6397de7b101',
    user_id: users[0].id,
    account_type: 'operating',
    provider: 'Barclays',
    account_ref: 'GB89BARC20060512345678',
    balance: 3200000.0,
    currency: 'GBP',
    metadata: { available_balance: 3185000.0, ledger_balance: 3200000.0 },
    updated_at: { raw: true }
  },
  {
    id: 'd63f0f95-95de-4a8d-b95e-7f7ef1ac7b22',
    user_id: users[0].id,
    account_type: 'operating',
    provider: 'HSBC',
    account_ref: 'GB29NWBK60161331926819',
    balance: 1100000.0,
    currency: 'GBP',
    metadata: { available_balance: 1097000.0, ledger_balance: 1100000.0 },
    updated_at: { raw: true }
  },
  {
    id: 'f89e61cc-0327-4fb1-8cc6-2b0d5a5fcb33',
    user_id: users[0].id,
    account_type: 'reserve',
    provider: 'Lloyds',
    account_ref: 'GB55LOYD30987654321098',
    balance: 500000.0,
    currency: 'GBP',
    metadata: { available_balance: 500000.0, ledger_balance: 500000.0 },
    updated_at: { raw: true }
  }
].map((row) => ({
  ...row,
  updated_at: '(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT'
}));

const snapshots = conversation.treasury_decision_snapshots.map((row) => ({
  ...row,
  created_at: '(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT',
  updated_at: '(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT'
}));

const suppliers = conversation.treasury_supplier_payment_candidates.map((row) => ({
  ...row,
  created_at: '(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT',
  updated_at: '(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT'
}));

const cashflowRows = cashflow90.treasury_cashflow_daily.map((row) => ({
  ...row,
  created_at: '(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT',
  updated_at: '(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT'
}));

const sqlValueWithRaw = (value) => {
  if (typeof value === 'string' && value.startsWith('(EXTRACT(EPOCH FROM NOW())')) return value;
  return sqlValue(value);
};

const buildInsertRaw = ({ table, columns, rows, conflict }) => {
  const header = `INSERT INTO ${table} (\n  ${columns.join(',\n  ')}\n)\nVALUES\n`;
  const values = rows.map((row) => {
    const line = columns.map((column) => sqlValueWithRaw(row[column])).join(', ');
    return `(${line})`;
  }).join(',\n');
  return `${header}${values}\n${conflict};\n`;
};

let sql = '';
sql += '-- Seed script for treasury conversational design\n';
sql += '-- Intended for a separate DB instance.\n';
sql += '-- Prerequisites: base schema + V8 treasury conversation migration.\n\n';
sql += 'BEGIN;\n\n';

sql += buildInsert({
  table: 'users',
  columns: ['id', 'external_user_id', 'full_name', 'country_code', 'base_currency', 'timezone', 'status', 'metadata'],
  rows: users,
  conflict: 'ON CONFLICT (id) DO NOTHING'
});

sql += '\n';
sql += buildInsertRaw({
  table: 'account_balances',
  columns: ['id', 'user_id', 'account_type', 'provider', 'account_ref', 'balance', 'currency', 'metadata', 'updated_at'],
  rows: balances,
  conflict: 'ON CONFLICT (id) DO NOTHING'
});

sql += '\n';
sql += buildInsertRaw({
  table: 'treasury_decision_snapshots',
  columns: ['id', 'user_id', 'snapshot_date', 'weekly_outflow_baseline', 'midweek_inflow_baseline', 'late_inflow_count_last_4_weeks', 'comfort_threshold', 'min_inflow_for_midweek_release', 'release_condition_hit_rate_10_weeks', 'currency', 'metadata', 'created_at', 'updated_at'],
  rows: snapshots,
  conflict: 'ON CONFLICT (user_id, snapshot_date) DO NOTHING'
});

sql += '\n';
sql += buildInsertRaw({
  table: 'treasury_supplier_payment_candidates',
  columns: ['id', 'user_id', 'supplier_ref', 'supplier_name', 'amount', 'currency', 'urgency', 'due_date', 'batch_hint', 'metadata', 'created_at', 'updated_at'],
  rows: suppliers,
  conflict: 'ON CONFLICT (id) DO NOTHING'
});

sql += '\n';
sql += buildInsertRaw({
  table: 'treasury_cashflow_daily',
  columns: ['id', 'user_id', 'business_date', 'day_name', 'total_inflows', 'total_outflows', 'payroll_outflow', 'supplier_outflow', 'closing_balance', 'currency', 'metadata', 'created_at', 'updated_at'],
  rows: cashflowRows,
  conflict: 'ON CONFLICT (user_id, business_date) DO NOTHING'
});

sql += '\nCOMMIT;\n';

fs.writeFileSync(outPath, sql);
console.log(`WROTE ${outPath}`);
