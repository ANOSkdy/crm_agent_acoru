-- Keep historical migrations/checksums and retired records intact.
-- New issue fields and persistent customer tabs.
CREATE TABLE task_company_tabs (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
ALTER TABLE tasks ADD COLUMN issue_number integer, ADD COLUMN opened_on date,
  ADD COLUMN completion_criteria text NOT NULL DEFAULT '', ADD COLUMN progress text NOT NULL DEFAULT '';
-- statement-breakpoint
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY company_id ORDER BY created_at, id)::integer AS number FROM tasks
)
UPDATE tasks t SET issue_number = n.number, opened_on = (t.created_at AT TIME ZONE 'Asia/Tokyo')::date,
  progress = COALESCE(t.description, '') FROM numbered n WHERE n.id = t.id;
-- statement-breakpoint
ALTER TABLE tasks ALTER COLUMN issue_number SET NOT NULL, ALTER COLUMN opened_on SET NOT NULL,
  ALTER COLUMN opened_on SET DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::date),
  ADD CONSTRAINT tasks_issue_number_positive CHECK (issue_number > 0),
  ADD CONSTRAINT tasks_issue_status CHECK (status IN ('open','in_progress','done','not_needed'));
-- statement-breakpoint
CREATE UNIQUE INDEX tasks_company_issue_number ON tasks(company_id, issue_number) NULLS NOT DISTINCT;
-- statement-breakpoint
INSERT INTO task_company_tabs(company_id)
SELECT DISTINCT t.company_id FROM tasks t JOIN companies c ON c.id=t.company_id
WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL;
-- statement-breakpoint
CREATE FUNCTION assign_issue_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize allocation per customer, including the legacy unassigned group.
  PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.company_id::text, 'unassigned'), 20413));
  IF TG_OP = 'INSERT' AND NEW.progress = '' AND NEW.description IS NOT NULL THEN
    NEW.progress := NEW.description;
  END IF;
  IF NEW.issue_number IS NULL THEN
    SELECT COALESCE(MAX(issue_number), 0) + 1 INTO NEW.issue_number FROM tasks WHERE company_id IS NOT DISTINCT FROM NEW.company_id;
  END IF;
  RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER tasks_assign_issue_number BEFORE INSERT OR UPDATE OF company_id, issue_number ON tasks
FOR EACH ROW EXECUTE FUNCTION assign_issue_number();
-- statement-breakpoint
CREATE FUNCTION ensure_task_company_tab() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    INSERT INTO task_company_tabs(company_id, created_by) VALUES(NEW.company_id, NEW.created_by)
    ON CONFLICT(company_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER tasks_company_tab AFTER INSERT OR UPDATE OF company_id ON tasks
FOR EACH ROW EXECUTE FUNCTION ensure_task_company_tab();
-- statement-breakpoint
CREATE OR REPLACE VIEW crm_live_tasks AS
SELECT t.* FROM tasks t
LEFT JOIN companies c ON c.id=t.company_id
LEFT JOIN crm_live_deals d ON d.id=t.deal_id
WHERE t.deleted_at IS NULL AND (t.company_id IS NULL OR c.deleted_at IS NULL)
  AND (t.deal_id IS NULL OR d.id IS NOT NULL);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION apply_raw_item(actor_id uuid,item_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE item extraction_items%ROWTYPE; actor users%ROWTYPE; deal deals%ROWTYPE; original raw_document_revisions%ROWTYPE;
 prior extraction_items%ROWTYPE; proposal uuid; payload jsonb; target_document uuid;
BEGIN
 SELECT * INTO actor FROM users WHERE id=actor_id AND is_active FOR SHARE;
 IF NOT FOUND OR actor.role NOT IN ('admin','member') THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 SELECT d.id INTO target_document FROM raw_documents d JOIN extraction_items i ON i.document_id=d.id
 WHERE i.id=item_id AND d.created_by=actor_id AND d.archived_at IS NULL FOR UPDATE OF d;
 IF NOT FOUND THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 SELECT * INTO item FROM extraction_items WHERE id=item_id FOR UPDATE;
 IF item.item_type='activity' THEN RAISE EXCEPTION 'RAW_RETIRED_TYPE'; END IF;
 IF item.review_status='applied' THEN RETURN jsonb_build_object('status','applied','alreadyApplied',true,'id',item.applied_id); END IF;
 SELECT * INTO prior FROM extraction_items WHERE document_id=target_document AND stable_item_key=item.stable_item_key AND applied_id IS NOT NULL LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('status','applied','alreadyApplied',true,'id',prior.applied_id,'source_item_id',prior.id); END IF;
 IF item.review_status<>'approved' OR item.reviewed_payload IS NULL OR item.comparison='same' THEN RAISE EXCEPTION 'RAW_REVIEW'; END IF;
 SELECT v.* INTO original FROM raw_document_revisions v JOIN extraction_runs r ON r.raw_revision_id=v.id WHERE r.id=item.extraction_run_id;
 IF original.document_id<>target_document OR position(item.source_quote IN original.content)=0 THEN RAISE EXCEPTION 'RAW_SOURCE'; END IF;
 IF item.item_type='work_log' THEN
  payload:=item.reviewed_payload;
  IF item.company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM companies WHERE id=item.company_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'RAW_RELATION'; END IF;
  IF item.deal_id IS NOT NULL THEN
   SELECT d.* INTO deal FROM deals d JOIN companies c ON c.id=d.company_id AND c.deleted_at IS NULL
    WHERE d.id=item.deal_id AND d.company_id=item.company_id AND d.deleted_at IS NULL FOR UPDATE OF d;
   IF NOT FOUND OR NOT COALESCE(actor.role='admin' OR deal.owner_user_id=actor_id,false) THEN RAISE EXCEPTION 'RAW_RELATION'; END IF;
   IF deal.agent_revision<>item.base_revision THEN
    UPDATE extraction_items SET review_status='conflict' WHERE id=item_id; RETURN jsonb_build_object('status','conflict');
   END IF;
  END IF;
  IF payload->>'worker_user_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=(payload->>'worker_user_id')::uuid AND is_active) THEN RAISE EXCEPTION 'RAW_RELATION'; END IF;
  INSERT INTO work_logs(worked_on,duration_minutes,worker_user_id,company_id,deal_id,description,extraction_item_id,created_by)
   VALUES((payload->>'date')::date,(payload->>'duration_minutes')::integer,(payload->>'worker_user_id')::uuid,item.company_id,item.deal_id,payload->>'title',item.id,actor_id)
   RETURNING id INTO proposal;
  UPDATE extraction_items SET review_status='applied',applied_type='work_log',applied_id=proposal,applied_at=now() WHERE id=item.id;
  INSERT INTO audit_logs(user_id,action,target_type,target_id,after_json)
   VALUES(actor_id,'raw_apply','work_log',proposal,jsonb_build_object('raw_revision_id',original.id,'extraction_item_id',item.id,'reviewed_payload',payload));
  RETURN jsonb_build_object('status','applied','alreadyApplied',false,'id',proposal);
 END IF;
 SELECT d.* INTO deal FROM deals d JOIN companies c ON c.id=d.company_id AND c.deleted_at IS NULL
 WHERE d.id=item.deal_id AND d.company_id=item.company_id AND d.deleted_at IS NULL FOR UPDATE OF d;
 IF NOT FOUND OR NOT COALESCE(actor.role='admin' OR deal.owner_user_id=actor_id,false) THEN RAISE EXCEPTION 'RAW_RELATION'; END IF;
 IF deal.agent_revision<>item.base_revision THEN
  UPDATE extraction_items SET review_status='conflict' WHERE id=item_id;
  RETURN jsonb_build_object('status','conflict');
 END IF;
 payload:=item.reviewed_payload;
 CASE item.item_type
  WHEN 'task' THEN
   INSERT INTO tasks(company_id,deal_id,title,progress,due_date,assigned_to,created_by)
    VALUES(item.company_id,item.deal_id,payload->>'title',COALESCE(payload->>'body',''),(payload->>'due_date')::date,actor_id,actor_id)
    RETURNING id INTO proposal;
  WHEN 'decision' THEN
   INSERT INTO deal_decisions(deal_id,content,rationale,decided_by,occurred_on)
    VALUES(item.deal_id,payload->>'title',COALESCE(payload->>'rationale',''),actor_id,(payload->>'date')::date)
    RETURNING id INTO proposal;
  ELSE RAISE EXCEPTION 'RAW_RETIRED_TYPE';
 END CASE;
 UPDATE extraction_items SET review_status='applied',applied_type=item.item_type,applied_id=proposal,applied_at=now() WHERE id=item.id;
 INSERT INTO audit_logs(user_id,action,target_type,target_id,after_json)
  VALUES(actor_id,'raw_apply',item.item_type,proposal,jsonb_build_object('raw_revision_id',original.id,'extraction_item_id',item.id,'reviewed_payload',payload));
 RETURN jsonb_build_object('status','applied','alreadyApplied',false,'id',proposal,'results',jsonb_build_array(jsonb_build_object('type',item.item_type,'id',proposal)));
END $$;
-- statement-breakpoint
