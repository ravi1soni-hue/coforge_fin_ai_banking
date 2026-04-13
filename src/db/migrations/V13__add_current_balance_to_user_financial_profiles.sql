-- V13__add_current_balance_to_user_financial_profiles.sql
ALTER TABLE user_financial_profiles ADD COLUMN IF NOT EXISTS current_balance NUMERIC(15,2) DEFAULT 0.00;
