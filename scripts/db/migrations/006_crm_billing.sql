ALTER TABLE billing.customers ADD COLUMN company_id uuid REFERENCES companies(id);
-- statement-breakpoint
ALTER TABLE billing.customers ADD COLUMN billing_enabled boolean NOT NULL DEFAULT true;
-- statement-breakpoint
ALTER TABLE billing.customers ADD COLUMN contact_id uuid REFERENCES contacts(id);
-- statement-breakpoint
ALTER TABLE billing.customers ADD COLUMN source_deal_id uuid REFERENCES deals(id);
-- statement-breakpoint
ALTER TABLE billing.customers ADD COLUMN template_confirmed boolean NOT NULL DEFAULT true;
-- statement-breakpoint
CREATE UNIQUE INDEX billing_company_unique ON billing.customers(company_id) WHERE company_id IS NOT NULL;
-- statement-breakpoint
WITH matches AS (
  SELECT b.id, min(c.id::text)::uuid AS company_id FROM billing.customers b
  JOIN companies c ON c.name=b.data->>'name' AND c.deleted_at IS NULL
  GROUP BY b.id HAVING count(*)=1
), unique_matches AS (
  SELECT * FROM matches WHERE company_id IN (SELECT company_id FROM matches GROUP BY company_id HAVING count(*)=1)
) UPDATE billing.customers b SET company_id=m.company_id, billing_enabled=b.data->>'status'='契約中'
FROM unique_matches m WHERE b.id=m.id;
-- statement-breakpoint
ALTER TABLE billing.invoices ADD COLUMN company_id uuid REFERENCES companies(id);
-- statement-breakpoint
UPDATE billing.invoices i SET company_id=b.company_id FROM billing.customers b JOIN companies c ON c.id=b.company_id
WHERE i.customer_id=b.id AND i.document->>'name'=c.name;
