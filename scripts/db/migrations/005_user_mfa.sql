CREATE TABLE IF NOT EXISTS auth_mfa_credentials (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('local', 'preview', 'production')),
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  secret_encrypted text NOT NULL,
  confirmed_at timestamptz,
  last_used_step bigint NOT NULL DEFAULT -1,
  PRIMARY KEY (user_id, environment)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_login_challenges (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  environment text NOT NULL,
  credential_version uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('enroll', 'verify')),
  return_to text NOT NULL DEFAULT '/dashboard',
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS auth_login_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
-- statement-breakpoint
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS mfa_version uuid;
-- statement-breakpoint
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS auth_environment text;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS auth_login_challenges_expiry ON auth_login_challenges(expires_at);
