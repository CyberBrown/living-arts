-- Migration: Add instances table and insert fixed API key
-- Run with: wrangler d1 execute living-arts-db --file=./migrations/0003_add_instances_and_fix_api_key.sql --remote

-- Create instances table for multi-tenant support
CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Insert the living-arts instance
INSERT OR IGNORE INTO instances (id, name, status)
VALUES ('living-arts', 'Living Arts', 'active');

-- Insert a fixed API key for development (so all workers can communicate)
INSERT OR REPLACE INTO api_keys (id, instance_id, key, name, enabled)
VALUES (
  'dev-key-fixed',
  'living-arts',
  'la_dev_DA77A783DF877D0A07D2EC815E6D8A3F',
  'Fixed Development API Key',
  1
);
