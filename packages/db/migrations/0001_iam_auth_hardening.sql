BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_canonical_ck'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_username_canonical_ck
      CHECK (username = lower(username) AND length(username) BETWEEN 3 AND 64);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_vendor_role_ck'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_vendor_role_ck
      CHECK ((role = 'VENDOR' AND vendor_id IS NOT NULL) OR role <> 'VENDOR');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS sessions_active_user_idx ON sessions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS audit_action_ts_idx ON audit_logs(action, event_ts);

COMMIT;
