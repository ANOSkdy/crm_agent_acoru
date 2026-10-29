CREATE TABLE raw_ingest_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),
 label text NOT NULL,secret_hash text NOT NULL UNIQUE CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 scope text NOT NULL DEFAULT 'raw:ingest' CHECK(scope='raw:ingest'),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revoked_at timestamptz,last_used_at timestamptz,
 CHECK(expires_at>created_at)
);
-- statement-breakpoint
CREATE INDEX raw_ingest_credentials_user_idx ON raw_ingest_credentials(user_id,created_at DESC);
-- statement-breakpoint
