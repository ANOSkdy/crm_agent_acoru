// Local upgrades are applied only to PGlite. Production uses a reviewed migration.
export const localSchema = `
CREATE TABLE IF NOT EXISTS mail_campaigns (
  id uuid PRIMARY KEY, version integer NOT NULL DEFAULT 1,
  subject text NOT NULL, body text NOT NULL, contact_ids jsonb NOT NULL DEFAULT '[]',
  company_ids jsonb NOT NULL DEFAULT '[]', recipient_mode text NOT NULL DEFAULT 'company',
  status text NOT NULL DEFAULT 'draft', actor_id uuid NOT NULL, actor_name text NOT NULL,
  tested_version integer, review jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mail_deliveries (
  id uuid PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES mail_campaigns(id),
  contact_id uuid, company_id uuid, email_key text NOT NULL, snapshot jsonb NOT NULL,
  status text NOT NULL, attempts integer NOT NULL DEFAULT 0, result text,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id, contact_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS mail_one_address ON mail_deliveries(campaign_id, email_key) WHERE status <> 'excluded';
CREATE TABLE IF NOT EXISTS mail_stops (email_key text PRIMARY KEY, actor_id uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mail_events (
  id uuid PRIMARY KEY, campaign_id uuid REFERENCES mail_campaigns(id), actor_id uuid NOT NULL,
  action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mail_pending ON mail_deliveries(status, campaign_id);
ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS company_ids jsonb NOT NULL DEFAULT '[]';
ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS recipient_mode text NOT NULL DEFAULT 'contacts';
ALTER TABLE mail_campaigns ALTER COLUMN contact_ids SET DEFAULT '[]';
ALTER TABLE mail_deliveries ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE mail_deliveries ALTER COLUMN contact_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mail_one_company ON mail_deliveries(campaign_id, company_id) WHERE company_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS mail_customer_addresses (
  company_id uuid PRIMARY KEY, email text NOT NULL, version integer NOT NULL DEFAULT 1,
  actor_id uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mail_manual_tests (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL, fingerprint text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'prepared', provider_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,fingerprint)
);
ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'simulation';
ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE mail_campaigns ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE mail_deliveries ADD COLUMN IF NOT EXISTS provider_id text;
-- Preserve old content and completed results. Never resume a contact-based job.
UPDATE mail_deliveries SET status='excluded',result='代表メール方式への変更により旧方式の未処理分を停止しました',updated_at=now()
 WHERE status IN ('pending','sending') AND campaign_id IN (SELECT id FROM mail_campaigns WHERE recipient_mode='contacts');
UPDATE mail_campaigns SET status='completed',updated_at=now() WHERE recipient_mode='contacts' AND status IN ('queued','running');
`
