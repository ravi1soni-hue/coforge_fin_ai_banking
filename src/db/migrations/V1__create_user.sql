CREATE TABLE users (
    -- id uses UUID with a default generator
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    external_user_id TEXT NOT NULL UNIQUE,
    full_name TEXT,
    
    country_code TEXT,
    base_currency TEXT,
    timezone TEXT,
    
    -- status restricted to 1, 2, or 3
    status SMALLINT NOT NULL CHECK (status IN (1, 2, 3)) DEFAULT 1,
    
    -- metadata uses JSONB for 'unknown' type
    metadata JSONB DEFAULT '{}',
    
    -- Generated timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
