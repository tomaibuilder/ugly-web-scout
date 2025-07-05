-- Database schema for UglyWebScout

-- Users table to store user information and credits
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL, -- A way to identify users if you expand
    credits INTEGER DEFAULT 1000,          -- Default credits for a new user
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audits table to store website audit results
CREATE TABLE IF NOT EXISTS audits (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,                   -- The audited URL, ensure it's unique
    score INTEGER,                              -- Score from OpenAI (0-100)
    quadrant VARCHAR(50),                       -- e.g., "Ugly", "Poor", "Good", "Excellent"
    reasons JSONB,                              -- Array of reasons/feedback from OpenAI

    audit_data_raw TEXT,                        -- Raw text/JSON response from OpenAI for debugging

    enriched_data JSONB,                        -- Enriched data from DropContact or other services
    email TEXT,                                 -- Contact email, potentially from enrichment

    last_audited_at TIMESTAMP WITH TIME ZONE,   -- Timestamp of the last OpenAI audit
    last_enriched_at TIMESTAMP WITH TIME ZONE,  -- Timestamp of the last enrichment

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- When the audit record was first created
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP  -- When the audit record was last updated
);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_users_timestamp' AND tgrelid = 'users'::regclass) THEN
    CREATE TRIGGER set_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END
$$;

-- Trigger for audits table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_audits_timestamp' AND tgrelid = 'audits'::regclass) THEN
    CREATE TRIGGER set_audits_timestamp
    BEFORE UPDATE ON audits
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();
  END IF;
END
$$;

-- Indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_audits_url ON audits(url);
CREATE INDEX IF NOT EXISTS idx_audits_quadrant ON audits(quadrant);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Insert a default user if one doesn't exist (primarily for the /credits endpoint to function)
INSERT INTO users (username, credits) VALUES ('default_user', 1000) ON CONFLICT (username) DO NOTHING;

-- Note on last_audited_at:
-- This is set in auditWorker.js to NOW() during INSERT.
-- If you prefer DB to handle it:
-- ALTER TABLE audits ALTER COLUMN last_audited_at SET DEFAULT CURRENT_TIMESTAMP;
-- And remove it from the INSERT statement in auditWorker.js or make it conditional.

COMMENT ON TABLE users IS 'Stores user information, primarily for managing API credits.';
COMMENT ON TABLE audits IS 'Stores results from website design audits performed by OpenAI and enriched contact data.';
COMMENT ON COLUMN audits.reasons IS 'JSONB array of strings detailing audit findings from OpenAI.';
COMMENT ON COLUMN audits.audit_data_raw IS 'Raw JSON or text response from the OpenAI API call for this audit.';
COMMENT ON COLUMN audits.enriched_data IS 'JSONB object containing data from enrichment services like DropContact.';
COMMENT ON COLUMN audits.last_audited_at IS 'Timestamp of when the OpenAI audit was last performed for this URL.';
COMMENT ON COLUMN audits.last_enriched_at IS 'Timestamp of when data enrichment was last performed for this URL.';

-- End of schema
SELECT 'Schema setup file execution attempted.' AS status;
