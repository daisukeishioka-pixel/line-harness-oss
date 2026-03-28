-- Migration 013: Add altText column for Flex Message notification preview
-- Run: wrangler d1 execute line-crm --file=packages/db/migrations/013_alt_text_staff.sql --remote

-- altText for broadcasts
ALTER TABLE broadcasts ADD COLUMN alt_text TEXT;

-- Staff members table for RBAC
CREATE TABLE IF NOT EXISTS staff_members (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT,
  role           TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff')),
  api_key        TEXT NOT NULL UNIQUE,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_staff_api_key ON staff_members (api_key);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff_members (role);
