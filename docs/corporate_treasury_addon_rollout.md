# Corporate Treasury Add-on Safe Rollout

This add-on is designed to be non-breaking for the current MVP.

## Safety Principles
- Additive-only migration.
- No ALTER/DROP/TRUNCATE on existing tables.
- No changes to existing repository contracts.
- Existing chat flow remains operational.

## New Migration
- `src/db/migrations/V7__create_corporate_treasury_addon.sql`

## What It Adds
- `treasury_payment_runs`
- `treasury_payment_run_items`
- `treasury_cashflow_daily`
- `treasury_release_conditions`
- `treasury_alert_rules`
- `treasury_approvals`
- `treasury_audit_log`

## Why MVP Will Not Break
- Existing tables (`users`, `account_balances`, `financial_summary_monthly`, `messages`, etc.) are untouched.
- Existing code paths do not depend on the new tables.
- If no corporate data is seeded, current behavior is unchanged.

## Demo-Day Rollout Steps
1. Take DB backup/snapshot.
2. Run migration `V7` only.
3. Do not wire runtime code to new tables for current demo unless required.
4. Seed sample records into new `treasury_*` tables.
5. Verify existing endpoints and websocket flow still pass smoke tests.

## Quick Smoke Test Checklist
- Health endpoint returns OK.
- Existing user chat question still gets response.
- Existing affordability flow still returns final response.
- New `treasury_*` tables exist and can be queried.

## Rollback Strategy
Because this is additive-only:
- Keep migration applied and disable corporate feature usage in app logic if needed.
- If strict rollback is needed, drop only `treasury_*` tables manually after demo.
