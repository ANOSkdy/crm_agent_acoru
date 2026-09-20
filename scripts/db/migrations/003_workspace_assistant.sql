-- Keep existing deal conversations; new conversations belong to a user and span the CRM.
ALTER TABLE agent_threads ALTER COLUMN deal_id DROP NOT NULL;
-- statement-breakpoint
ALTER TABLE agent_threads ADD COLUMN title text NOT NULL DEFAULT '新しいチャット', ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- statement-breakpoint
UPDATE agent_threads t SET title=left(d.title,80) FROM deals d WHERE d.id=t.deal_id;
-- statement-breakpoint
CREATE INDEX agent_threads_owner_time ON agent_threads(created_by, updated_at DESC) WHERE deal_id IS NULL;
-- statement-breakpoint
ALTER TABLE agent_runs ADD COLUMN progress text, ADD COLUMN tool_trace jsonb NOT NULL DEFAULT '[]';
-- statement-breakpoint
CREATE VIEW crm_ai_records AS
WITH live_companies AS (SELECT * FROM companies WHERE deleted_at IS NULL),
live_deals AS (SELECT d.* FROM deals d JOIN live_companies c ON c.id = d.company_id WHERE d.deleted_at IS NULL)
SELECT 'company'::text AS kind, c.id, c.id AS company_id, NULL::uuid AS deal_id, c.name AS title,
  concat_ws(' ', c.name, c.industry, c.memo) AS body, c.updated_at::date AS occurred_on, c.status,
  jsonb_build_object('name',c.name,'industry',c.industry,'status',c.status,'memo',c.memo,'address',c.address,'phone',c.phone,'website',c.website_url) AS data,
  c.updated_at, c.name AS company_name
FROM live_companies c
UNION ALL
SELECT 'deal', d.id, d.company_id, d.id, d.title, concat_ws(' ', d.title,c.name,d.memo,x.current_summary,x.current_strategy,x.blockers), d.expected_close_date, d.status,
  jsonb_build_object('title',d.title,'company_name',c.name,'amount',d.amount,'probability',d.probability,'stage',s.name,'status',d.status,'expected_close_date',d.expected_close_date,'owner',u.name,'memo',d.memo,'current_summary',x.current_summary,'health',x.health,'strategy',x.current_strategy,'blockers',x.blockers), d.updated_at, c.name
FROM live_deals d JOIN live_companies c ON c.id=d.company_id LEFT JOIN deal_stages s ON s.id=d.stage_id LEFT JOIN users u ON u.id=d.owner_user_id LEFT JOIN deal_contexts x ON x.deal_id=d.id
UNION ALL
SELECT 'contact', x.id, x.company_id, NULL::uuid, x.name, concat_ws(' ',x.name,c.name,x.department,x.position,x.memo), x.updated_at::date, NULL::text,
  jsonb_build_object('name',x.name,'company_name',c.name,'department',x.department,'position',x.position,'is_decision_maker',x.is_decision_maker,'email',x.email,'phone',x.phone,'memo',x.memo), x.updated_at, c.name
FROM contacts x JOIN live_companies c ON c.id=x.company_id WHERE x.deleted_at IS NULL
UNION ALL
SELECT 'activity', x.id, x.company_id, x.deal_id, x.summary, concat_ws(' ',x.summary,c.name,x.body,x.next_action), (x.activity_date AT TIME ZONE 'Asia/Tokyo')::date, x.type,
  jsonb_build_object('summary',x.summary,'company_name',c.name,'deal_title',d.title,'type',x.type,'activity_date',x.activity_date,'body',x.body,'next_action',x.next_action), x.updated_at, c.name
FROM activities x JOIN live_companies c ON c.id=x.company_id LEFT JOIN live_deals d ON d.id=x.deal_id WHERE x.deleted_at IS NULL AND (x.deal_id IS NULL OR d.id IS NOT NULL)
UNION ALL
SELECT 'task', x.id, x.company_id, x.deal_id, x.title, concat_ws(' ',x.title,c.name,x.description), x.due_date, x.status,
  jsonb_build_object('title',x.title,'company_name',c.name,'deal_title',d.title,'description',x.description,'due_date',x.due_date,'priority',x.priority,'status',x.status,'assigned_to',u.name), x.updated_at, c.name
FROM tasks x LEFT JOIN live_companies c ON c.id=x.company_id LEFT JOIN live_deals d ON d.id=x.deal_id LEFT JOIN users u ON u.id=x.assigned_to
WHERE x.deleted_at IS NULL AND (x.company_id IS NULL OR c.id IS NOT NULL) AND (x.deal_id IS NULL OR d.id IS NOT NULL)
UNION ALL
SELECT 'decision', x.id, d.company_id, x.deal_id, left(x.content,150), concat_ws(' ',x.content,x.rationale,c.name,d.title), (x.created_at AT TIME ZONE 'Asia/Tokyo')::date, NULL::text,
  jsonb_build_object('content',x.content,'rationale',x.rationale,'deal_title',d.title,'company_name',c.name,'created_at',x.created_at), x.created_at, c.name
FROM deal_decisions x JOIN live_deals d ON d.id=x.deal_id JOIN live_companies c ON c.id=d.company_id
UNION ALL
SELECT 'file', x.id, x.company_id, x.deal_id, x.filename, concat_ws(' ',x.filename,c.name,x.file_type), (x.created_at AT TIME ZONE 'Asia/Tokyo')::date, NULL::text,
  jsonb_build_object('filename',x.filename,'company_name',c.name,'deal_title',d.title,'file_type',x.file_type,'mime_type',x.mime_type,'content_available',false), x.created_at, c.name
FROM files x LEFT JOIN live_companies c ON c.id=x.company_id LEFT JOIN live_deals d ON d.id=x.deal_id
WHERE x.deleted_at IS NULL AND (x.company_id IS NULL OR c.id IS NOT NULL) AND (x.deal_id IS NULL OR d.id IS NOT NULL);
