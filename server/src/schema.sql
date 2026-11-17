CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('agent', 'supervisor')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Async job records for the external recorded-call analysis API.
CREATE TABLE IF NOT EXISTS call_jobs (
  id TEXT PRIMARY KEY,
  partner TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  duration_sec DOUBLE PRECISION,
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  chunks JSONB NOT NULL DEFAULT '[]',
  error TEXT,
  callback_url TEXT,
  -- Held only until the job finishes processing (see jobQueue.ts), then cleared --
  -- this is what lets a queued job survive a server restart instead of vanishing silently.
  audio BYTEA,
  -- Webhook delivery state. 'none' when no callback_url was given. Tracked in the DB rather than
  -- an in-memory timer so a scheduled retry (up to 30 min out) survives a server restart --
  -- see webhookPoller.ts.
  webhook_status TEXT NOT NULL DEFAULT 'none' CHECK (webhook_status IN ('none', 'pending', 'delivered', 'failed')),
  webhook_attempts INTEGER NOT NULL DEFAULT 0,
  webhook_next_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_jobs_partner_status ON call_jobs (partner, status);
CREATE INDEX IF NOT EXISTS idx_call_jobs_webhook_due ON call_jobs (webhook_status, webhook_next_at);

-- CREATE TABLE IF NOT EXISTS above is a no-op once the table already exists, so new columns
-- added later need an explicit ALTER TABLE to reach existing deployments.
ALTER TABLE call_jobs ADD COLUMN IF NOT EXISTS audio BYTEA;
ALTER TABLE call_jobs ADD COLUMN IF NOT EXISTS webhook_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE call_jobs ADD COLUMN IF NOT EXISTS webhook_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE call_jobs ADD COLUMN IF NOT EXISTS webhook_next_at TIMESTAMPTZ;
