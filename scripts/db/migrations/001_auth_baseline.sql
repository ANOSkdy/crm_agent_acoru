ALTER TABLE users ADD COLUMN IF NOT EXISTS login_id text;
-- statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
-- statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
-- statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
-- statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0;
-- statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
-- statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at timestamptz;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(), user_agent text, ip_address text
);
