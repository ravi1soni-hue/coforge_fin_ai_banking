CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_user_id TEXT NOT NULL UNIQUE,
    full_name TEXT,
    country_code TEXT,
    base_currency TEXT,
    timezone TEXT,
    status SMALLINT NOT NULL CHECK (status IN (1, 2, 3)) DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
