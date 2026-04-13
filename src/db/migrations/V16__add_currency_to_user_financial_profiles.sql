-- V16__add_currency_to_user_financial_profiles.sql
ALTER TABLE user_financial_profiles ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'GBP';
