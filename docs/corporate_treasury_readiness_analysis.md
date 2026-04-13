# Corporate Treasury Conversational Scope (VP Brief)

## Objective
Build only one thing: conversational treasury answers from user DB data.

Out of scope for now:
- No auto actions
- No payment execution
- No approval workflow
- No audit workflow

## What we can do
We can support conversations like:
- Can I release 750,000 GBP today?
- What if I split this run into two batches?
- What is the risk if receipts are delayed?

And respond using actual DB-driven numbers.

## Why tomorrow full scenario is still hard
Your target conversation depends on daily behavior over recent history:
- last 90 days inflows/outflows
- late receipt pattern
- projected low balance by day

Current schema is mostly monthly plus balances, so it lacks enough daily treasury context.

## Minimum changes required (conversational only)

## 1) Database changes
To match your script style reliably, one table is not enough.

Minimum practical set (conversational-only):

1. treasury_cashflow_daily
- user_id
- business_date
- total_inflows
- total_outflows
- payroll_outflow
- supplier_outflow
- closing_balance
- currency
- metadata

2. treasury_decision_snapshots
- user_id
- snapshot_date
- weekly_outflow_baseline
- midweek_inflow_baseline
- late_inflow_count_last_4_weeks
- comfort_threshold
- precomputed_confidence_metrics
- currency

Why this second table is needed:
- Your script references pre-aggregated behavior metrics (example: 1.9m Tue-Thu inflow, late twice in 4 weeks, 8 out of 10 weeks condition hit).
- Computing these on every chat turn from raw daily rows is possible but slower and less consistent for demo.

Optional third table (if you want better split conversation quality):

3. treasury_supplier_payment_candidates
- user_id
- supplier_ref
- supplier_name
- amount
- urgency (URGENT/DEFERABLE)
- due_date
- currency

This optional table helps answer:
- some payments are urgent, some can wait
- suggested split now versus mid-week

No changes required to existing MVP tables for conversational-only phase.

## 2) AI layer changes
Minimal AI changes only:
1. Extract payment amount and conversational intent from user message.
2. Compute treasury numbers from DB data deterministically.
3. Let LLM convert computed numbers into plain conversational response.

This is already aligned with:
- [src/agent_orchastration_v3/services/treasury.analysis.service.ts](src/agent_orchastration_v3/services/treasury.analysis.service.ts#L1)
- [src/agent_orchastration_v3/agents/synthesis.agent.ts](src/agent_orchastration_v3/agents/synthesis.agent.ts#L1)

## 3) What we should not implement now
- Any release action APIs
- Any maker-checker states
- Any operational orchestration

Reason: not needed for conversational demo and adds unnecessary risk before demo.

## Delivery estimate (conversational-only)
If scoped strictly to conversation:
- DB + seed + wiring + scenario tuning: 2 to 4 working days

If you want stronger confidence and better output consistency:
- Add 2 to 3 more days for prompt tuning and scenario regression checks

## VP talk track (simple)
1. We are intentionally delivering conversational advisory first.
2. For script-level quality, we need daily cashflow plus one pre-aggregated treasury snapshot dataset.
3. We are not attempting execution controls in this phase.
4. This keeps tomorrow's plan safe and focused.

## Current planning artifacts
- Focused 3-table migration (conversational-only): [src/db/migrations/V8__create_treasury_conversation_tables.sql](src/db/migrations/V8__create_treasury_conversation_tables.sql)
- Focused seed dataset (3 tables): [docs/uk_treasury_conversation_seed_data.json](docs/uk_treasury_conversation_seed_data.json)
- Broader dataset (if needed later): [docs/uk_treasury_seed_data.json](docs/uk_treasury_seed_data.json)
