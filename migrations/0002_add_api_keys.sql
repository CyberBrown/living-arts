-- Migration: Add API keys table for worker authentication
-- Run with: wrangler d1 execute living-arts-db --file=./migrations/0002_add_api_keys.sql

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  name TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

-- Create index for fast key lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_instance ON api_keys(instance_id);

-- Insert a default API key for development (replace in production)
INSERT INTO api_keys (id, instance_id, key, name, enabled)
VALUES (
  'dev-key-001',
  'living-arts',
  'la_dev_' || hex(randomblob(16)),
  'Development API Key',
  1
);
