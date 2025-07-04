CREATE TABLE audits (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    score INTEGER NOT NULL,
    quadrant TEXT NOT NULL,
    reasons JSONB,
    enriched_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    credits INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audits_url ON audits(url);
CREATE INDEX idx_audits_quadrant ON audits(quadrant);
