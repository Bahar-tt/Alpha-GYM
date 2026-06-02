-- Session tracking columns for members (used by MVP registration form)
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS used_sessions integer NOT NULL DEFAULT 0;

ALTER TABLE members
  ADD CONSTRAINT members_used_sessions_check
  CHECK (used_sessions >= 0 AND used_sessions <= total_sessions);
