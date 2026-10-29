CREATE TABLE IF NOT EXISTS mail_campaigns (
  id uuid PRIMARY KEY, version integer NOT NULL DEFAULT 1,
  subject text NOT NULL, body text NOT NULL, contact_ids jsonb NOT NULL DEFAULT '[]',
  company_ids jsonb NOT NULL DEFAULT '[]', recipient_mode text NOT NULL DEFAULT 'company',
  status text NOT NULL DEFAULT 'draft', actor_id uuid NOT NULL, actor_name text NOT NULL,
  tested_version integer, review jsonb,
  delivery_mode text NOT NULL DEFAULT 'simulation', lease_token uuid, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
)
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS mail_deliveries (
  id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES mail_campaigns(id),
  contact_id uuid, company_id uuid, email_key text NOT NULL, snapshot jsonb NOT NULL,
  status text NOT NULL, attempts integer NOT NULL DEFAULT 0, result text, provider_id text,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id, contact_id)
)
-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS mail_one_address ON mail_deliveries(campaign_id,email_key) WHERE status<>'excluded'
-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS mail_one_company ON mail_deliveries(campaign_id,company_id) WHERE company_id IS NOT NULL
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS mail_pending ON mail_deliveries(status,campaign_id)
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS mail_stops (email_key text PRIMARY KEY,actor_id uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS mail_events (
  id uuid PRIMARY KEY,campaign_id uuid REFERENCES mail_campaigns(id),actor_id uuid NOT NULL,
  action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
)
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS mail_customer_addresses (
  company_id uuid PRIMARY KEY,email text NOT NULL,version integer NOT NULL DEFAULT 1,
  actor_id uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
)
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS mail_manual_tests (
  id uuid PRIMARY KEY,actor_id uuid NOT NULL,fingerprint text NOT NULL,payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'prepared',provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,fingerprint)
)
