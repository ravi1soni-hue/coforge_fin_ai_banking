-- V14__add_monthly_income_to_user_financial_profiles.sql
ALTER TABLE user_financial_profiles ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(15,2) DEFAULT 0.00;
