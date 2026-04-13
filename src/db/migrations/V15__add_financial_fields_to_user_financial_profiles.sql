-- V15__add_financial_fields_to_user_financial_profiles.sql
ALTER TABLE user_financial_profiles ADD COLUMN IF NOT EXISTS monthly_expenses NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE user_financial_profiles ADD COLUMN IF NOT EXISTS monthly_savings NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE user_financial_profiles ADD COLUMN IF NOT EXISTS monthly_investments NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE user_financial_profiles ADD COLUMN IF NOT EXISTS monthly_debt NUMERIC(15,2) DEFAULT 0.00;
