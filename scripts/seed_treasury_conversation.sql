-- Seed script for treasury conversational design
-- Intended for a separate DB instance.
-- Prerequisites: base schema + V8 treasury conversation migration.

BEGIN;

INSERT INTO users (
  id,
  external_user_id,
  full_name,
  country_code,
  base_currency,
  timezone,
  status,
  metadata
)
VALUES
('9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', 'corp-northstar-001', 'Northstar Retail Ltd Treasury', 'GB', 'GBP', 'Europe/London', 1, '{"segment":"mid_market","industry":"retail","isCorporate":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO account_balances (
  id,
  user_id,
  account_type,
  provider,
  account_ref,
  balance,
  currency,
  metadata,
  updated_at
)
VALUES
('39f3a6d4-7b7a-4f2b-b2f3-b6397de7b101', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', 'operating', 'Barclays', 'GB89BARC20060512345678', 3200000, 'GBP', '{"available_balance":3185000,"ledger_balance":3200000}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('d63f0f95-95de-4a8d-b95e-7f7ef1ac7b22', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', 'operating', 'HSBC', 'GB29NWBK60161331926819', 1100000, 'GBP', '{"available_balance":1097000,"ledger_balance":1100000}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('f89e61cc-0327-4fb1-8cc6-2b0d5a5fcb33', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', 'reserve', 'Lloyds', 'GB55LOYD30987654321098', 500000, 'GBP', '{"available_balance":500000,"ledger_balance":500000}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
ON CONFLICT (id) DO NOTHING;

INSERT INTO treasury_decision_snapshots (
  id,
  user_id,
  snapshot_date,
  weekly_outflow_baseline,
  midweek_inflow_baseline,
  late_inflow_count_last_4_weeks,
  comfort_threshold,
  min_inflow_for_midweek_release,
  release_condition_hit_rate_10_weeks,
  currency,
  metadata,
  created_at,
  updated_at
)
VALUES
('5c9f4de5-53ec-4f77-9ea5-2636b3cf8001', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-13', 3600000, 1900000, 2, 1300000, 600000, 0.8, 'GBP', '{"payroll_day":"FRIDAY","historical_window_days":90,"note":"Derived from actual account movement aggregates"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
ON CONFLICT (user_id, snapshot_date) DO NOTHING;

INSERT INTO treasury_supplier_payment_candidates (
  id,
  user_id,
  supplier_ref,
  supplier_name,
  amount,
  currency,
  urgency,
  due_date,
  batch_hint,
  metadata,
  created_at,
  updated_at
)
VALUES
('9a1b5b4c-7f63-4f07-8f9a-6e9daac77001', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', 'SUP-001', 'London Packaging Co', 300000, 'GBP', 'URGENT', '2026-04-13', 'T0', '{"category":"packaging"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('9a1b5b4c-7f63-4f07-8f9a-6e9daac77002', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', 'SUP-002', 'Manchester Logistics Ltd', 220000, 'GBP', 'URGENT', '2026-04-13', 'T0', '{"category":"logistics"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('9a1b5b4c-7f63-4f07-8f9a-6e9daac77003', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', 'SUP-003', 'Bristol Office Supply', 120000, 'GBP', 'DEFERABLE', '2026-04-15', 'T1', '{"category":"office"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('9a1b5b4c-7f63-4f07-8f9a-6e9daac77004', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', 'SUP-004', 'Leeds Components PLC', 110000, 'GBP', 'DEFERABLE', '2026-04-15', 'T1', '{"category":"components"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
ON CONFLICT (id) DO NOTHING;

INSERT INTO treasury_cashflow_daily (
  id,
  user_id,
  business_date,
  day_name,
  total_inflows,
  total_outflows,
  payroll_outflow,
  supplier_outflow,
  closing_balance,
  currency,
  metadata,
  created_at,
  updated_at
)
VALUES
('cf90-2026-01-14', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-14', 'WEDNESDAY', 670800, 602400, 0, 381520, 4868400, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-15', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-15', 'THURSDAY', 645120, 565600, 0, 353500, 4947920, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-16', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-16', 'FRIDAY', 386080, 1676400, 1450000, 223520, 3657600, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-17', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-17', 'SATURDAY', 181440, 143080, 0, 71540, 3695960, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-18', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-18', 'SUNDAY', 120000, 82240, 0, 30840, 3733720, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-19', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-19', 'MONDAY', 317440, 434280, 0, 258500, 3616880, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-20', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-20', 'TUESDAY', 610080, 540800, 0, 343200, 3686160, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-21', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-21', 'WEDNESDAY', 634400, 627600, 0, 397480, 3692960, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-22', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-22', 'THURSDAY', 609840, 589120, 0, 368200, 3713680, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-23', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-23', 'FRIDAY', 392160, 1656600, 1450000, 220880, 2449240, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-24', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-24', 'SATURDAY', 184320, 141400, 0, 70700, 2492160, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-25', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-25', 'SUNDAY', 121920, 81280, 0, 30480, 2532800, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-26', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-26', 'MONDAY', 322560, 429240, 0, 255500, 2426120, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-27', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-27', 'TUESDAY', 620000, 534560, 0, 339240, 2511560, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-28', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-28', 'WEDNESDAY', 644800, 620400, 0, 392920, 2535960, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-29', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-29', 'THURSDAY', 619920, 582400, 0, 364000, 2573480, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-30', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-30', 'FRIDAY', 370880, 1725900, 1450000, 230120, 1218460, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-01-31', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-01-31', 'SATURDAY', 174240, 147280, 0, 73640, 1245420, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-01', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-01', 'SUNDAY', 123840, 80320, 0, 30120, 1288940, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-02', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-02', 'MONDAY', 327680, 424200, 0, 252500, 1192420, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-03', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-03', 'TUESDAY', 629920, 528320, 0, 335280, 1294020, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-04', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-04', 'WEDNESDAY', 655200, 613200, 0, 388360, 1336020, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-05', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-05', 'THURSDAY', 630000, 575680, 0, 359800, 1390340, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-06', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-06', 'FRIDAY', 376960, 1706100, 1450000, 227480, 61200, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-07', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-07', 'SATURDAY', 177120, 145600, 0, 72800, 92720, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-08', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-08', 'SUNDAY', 117120, 83680, 0, 31380, 126160, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-09', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-09', 'MONDAY', 309760, 441840, 0, 263000, -5920, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-10', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-10', 'TUESDAY', 639840, 522080, 0, 331320, 111840, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-11', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-11', 'WEDNESDAY', 665600, 606000, 0, 383800, 171440, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-12', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-12', 'THURSDAY', 640080, 568960, 0, 355600, 242560, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-13', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-13', 'FRIDAY', 383040, 1686300, 1450000, 224840, -1060700, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-14', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-14', 'SATURDAY', 180000, 143920, 0, 71960, -1024620, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-15', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-15', 'SUNDAY', 119040, 82720, 0, 31020, -988300, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-16', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-16', 'MONDAY', 314880, 436800, 0, 260000, -1110220, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-17', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-17', 'TUESDAY', 605120, 543920, 0, 345180, -1049020, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-18', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-18', 'WEDNESDAY', 629200, 631200, 0, 399760, -1051020, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-19', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-19', 'THURSDAY', 650160, 562240, 0, 351400, -963100, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-20', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-20', 'FRIDAY', 389120, 1666500, 1450000, 222200, -2240480, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-21', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-21', 'SATURDAY', 182880, 142240, 0, 71120, -2199840, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-22', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-22', 'SUNDAY', 120960, 81760, 0, 30660, -2160640, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-23', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-23', 'MONDAY', 320000, 431760, 0, 257000, -2272400, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-24', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-24', 'TUESDAY', 615040, 537680, 0, 341220, -2195040, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-25', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-25', 'WEDNESDAY', 639600, 624000, 0, 395200, -2179440, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-26', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-26', 'THURSDAY', 614880, 585760, 0, 366100, -2150320, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-27', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-27', 'FRIDAY', 367840, 1735800, 1450000, 231440, -3518280, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-02-28', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-02-28', 'SATURDAY', 185760, 140560, 0, 70280, -3473080, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-01', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-01', 'SUNDAY', 122880, 80800, 0, 30300, -3431000, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-02', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-02', 'MONDAY', 325120, 426720, 0, 254000, -3532600, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-03', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-03', 'TUESDAY', 624960, 531440, 0, 337260, -3439080, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-04', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-04', 'WEDNESDAY', 650000, 616800, 0, 390640, -3405880, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-05', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-05', 'THURSDAY', 624960, 579040, 0, 361900, -3359960, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-06', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-06', 'FRIDAY', 373920, 1716000, 1450000, 228800, -4702040, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-07', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-07', 'SATURDAY', 175680, 146440, 0, 73220, -4672800, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-08', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-08', 'SUNDAY', 116160, 84160, 0, 31560, -4640800, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-09', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-09', 'MONDAY', 330240, 421680, 0, 251000, -4732240, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-10', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-10', 'TUESDAY', 634880, 525200, 0, 333300, -4622560, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-11', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-11', 'WEDNESDAY', 660400, 609600, 0, 386080, -4571760, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-12', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-12', 'THURSDAY', 635040, 572320, 0, 357700, -4509040, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-13', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-13', 'FRIDAY', 380000, 1696200, 1450000, 226160, -5825240, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-14', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-14', 'SATURDAY', 178560, 144760, 0, 72380, -5791440, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-15', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-15', 'SUNDAY', 118080, 83200, 0, 31200, -5756560, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-16', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-16', 'MONDAY', 312320, 439320, 0, 261500, -5883560, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-17', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-17', 'TUESDAY', 600160, 547040, 0, 347160, -5830440, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-18', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-18', 'WEDNESDAY', 670800, 602400, 0, 381520, -5762040, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-19', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-19', 'THURSDAY', 645120, 565600, 0, 353500, -5682520, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-20', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-20', 'FRIDAY', 386080, 1676400, 1450000, 223520, -6972840, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-21', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-21', 'SATURDAY', 181440, 143080, 0, 71540, -6934480, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-22', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-22', 'SUNDAY', 120000, 82240, 0, 30840, -6896720, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-23', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-23', 'MONDAY', 317440, 434280, 0, 258500, -7013560, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-24', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-24', 'TUESDAY', 414854, 540800, 0, 343200, -7139506, 'GBP', '{"receiptPunctuality":"LATE","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-25', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-25', 'WEDNESDAY', 634400, 627600, 0, 397480, -7132706, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-26', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-26', 'THURSDAY', 609840, 589120, 0, 368200, -7111986, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-27', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-27', 'FRIDAY', 392160, 1656600, 1450000, 220880, -8376426, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-28', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-28', 'SATURDAY', 184320, 141400, 0, 70700, -8333506, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-29', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-29', 'SUNDAY', 121920, 81280, 0, 30480, -8292866, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-30', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-30', 'MONDAY', 322560, 429240, 0, 255500, -8399546, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-03-31', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-03-31', 'TUESDAY', 620000, 534560, 0, 339240, -8314106, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-01', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-01', 'WEDNESDAY', 644800, 620400, 0, 392920, -8289706, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-02', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-02', 'THURSDAY', 421546, 582400, 0, 364000, -8450560, 'GBP', '{"receiptPunctuality":"LATE","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-03', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-03', 'FRIDAY', 370880, 1725900, 1450000, 230120, -9805580, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-04', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-04', 'SATURDAY', 174240, 147280, 0, 73640, -9778620, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-05', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-05', 'SUNDAY', 123840, 80320, 0, 30120, -9735100, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-06', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-06', 'MONDAY', 327680, 424200, 0, 252500, -9831620, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-07', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-07', 'TUESDAY', 629920, 528320, 0, 335280, -9730020, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-08', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-08', 'WEDNESDAY', 655200, 613200, 0, 388360, -9688020, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-09', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-09', 'THURSDAY', 630000, 575680, 0, 359800, -9633700, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-10', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-10', 'FRIDAY', 376960, 1706100, 1450000, 227480, -10962840, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-11', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-11', 'SATURDAY', 177120, 145600, 0, 72800, -10931320, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-12', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-12', 'SUNDAY', 117120, 83680, 0, 31380, -10897880, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT),
('cf90-2026-04-13', '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1', '2026-04-13', 'MONDAY', 309760, 441840, 0, 263000, -11029960, 'GBP', '{"receiptPunctuality":"ON_TIME","source":"synthetic_uk_treasury_90d","generatedFor":"conversational_confidence"}'::jsonb, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT, (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT)
ON CONFLICT (user_id, business_date) DO NOTHING;

COMMIT;
