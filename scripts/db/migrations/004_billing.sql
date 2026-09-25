CREATE SCHEMA IF NOT EXISTS billing;
-- statement-breakpoint
CREATE TABLE billing.settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE billing.customers (
  id text PRIMARY KEY, data jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE billing.invoices (
  id text PRIMARY KEY, customer_id text REFERENCES billing.customers(id), period text NOT NULL CHECK (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','simulated','held','sending','uncertain','sent')),
  document jsonb NOT NULL, subtotal bigint NOT NULL CHECK (subtotal >= 0), tax bigint NOT NULL CHECK (tax >= 0), total bigint NOT NULL CHECK (total = subtotal + tax),
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, period)
);
-- statement-breakpoint
CREATE TABLE billing.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id text NOT NULL REFERENCES billing.invoices(id), revision integer NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test','live')), status text NOT NULL CHECK (status IN ('simulated','sending','sent','uncertain')),
  recipient text NOT NULL, payload jsonb NOT NULL, pdf_base64 text NOT NULL,
  provider_id text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invoice_id, mode, revision)
);
-- statement-breakpoint
CREATE UNIQUE INDEX billing_one_live_delivery ON billing.deliveries(invoice_id) WHERE mode = 'live';
-- statement-breakpoint
CREATE TABLE billing.events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, action text NOT NULL, target text,
  detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX billing_invoice_queue ON billing.invoices(period, status);
