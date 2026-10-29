ALTER TABLE extraction_items DROP CONSTRAINT extraction_items_item_type_check;
-- statement-breakpoint
ALTER TABLE extraction_items ADD CONSTRAINT extraction_items_item_type_check CHECK(item_type IN ('activity','task','decision','work_log'));
-- statement-breakpoint
CREATE TABLE work_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),worked_on date NOT NULL,duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440),
 worker_user_id uuid REFERENCES users(id),company_id uuid REFERENCES companies(id),deal_id uuid REFERENCES deals(id),activity_id uuid REFERENCES activities(id),
 description text NOT NULL,extraction_item_id uuid UNIQUE REFERENCES extraction_items(id),
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX work_logs_date_idx ON work_logs(worked_on) WHERE status='confirmed';
-- statement-breakpoint
CREATE INDEX work_logs_company_idx ON work_logs(company_id,worked_on);
-- statement-breakpoint
CREATE INDEX work_logs_deal_idx ON work_logs(deal_id,worked_on);
-- statement-breakpoint
CREATE INDEX work_logs_worker_idx ON work_logs(worker_user_id);
-- statement-breakpoint
CREATE INDEX work_logs_activity_idx ON work_logs(activity_id);
-- statement-breakpoint
CREATE VIEW confirmed_work_logs AS
 SELECT w.* FROM work_logs w LEFT JOIN companies c ON c.id=w.company_id LEFT JOIN deals d ON d.id=w.deal_id
 WHERE w.status='confirmed' AND (w.company_id IS NULL OR c.deleted_at IS NULL)
 AND (w.deal_id IS NULL OR (d.deleted_at IS NULL AND EXISTS(SELECT 1 FROM companies dc WHERE dc.id=d.company_id AND dc.deleted_at IS NULL)));
-- statement-breakpoint

CREATE OR REPLACE FUNCTION review_raw_item(actor_id uuid,item_id uuid,payload jsonb,target_company uuid,target_deal uuid,reject_item boolean,confirm_new boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE item extraction_items%ROWTYPE; actor users%ROWTYPE; deal deals%ROWTYPE;
BEGIN
 SELECT * INTO actor FROM users WHERE id=actor_id AND is_active FOR SHARE;
 IF NOT FOUND OR actor.role NOT IN ('admin','member') THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 PERFORM d.id FROM raw_documents d JOIN extraction_items i ON i.document_id=d.id WHERE i.id=item_id AND d.created_by=actor_id FOR UPDATE OF d;
 SELECT i.* INTO item FROM extraction_items i JOIN raw_documents d ON d.id=i.document_id
 WHERE i.id=item_id AND d.created_by=actor_id AND d.archived_at IS NULL FOR UPDATE OF i;
 IF NOT FOUND THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 IF item.review_status='applied' OR item.applied_id IS NOT NULL THEN RAISE EXCEPTION 'RAW_APPLIED'; END IF;
 IF reject_item THEN
  UPDATE extraction_items SET review_status='rejected',reviewed_by=actor_id,reviewed_at=now() WHERE id=item_id; RETURN;
 END IF;
 IF item.comparison='same' THEN RAISE EXCEPTION 'RAW_DUPLICATE'; END IF;
 IF item.comparison IN ('changed','ambiguous') AND NOT confirm_new THEN RAISE EXCEPTION 'RAW_CONFIRM_NEW'; END IF;
 IF item.item_type='work_log' AND target_deal IS NULL THEN
  IF target_company IS NOT NULL AND NOT EXISTS(SELECT 1 FROM companies WHERE id=target_company AND deleted_at IS NULL) THEN RAISE EXCEPTION 'RAW_RELATION'; END IF;
 ELSE
 SELECT d.* INTO deal FROM deals d JOIN companies c ON c.id=d.company_id AND c.deleted_at IS NULL
 WHERE d.id=target_deal AND d.company_id=target_company AND d.deleted_at IS NULL FOR SHARE OF d;
 IF NOT FOUND OR NOT COALESCE(actor.role='admin' OR deal.owner_user_id=actor_id,false) THEN RAISE EXCEPTION 'RAW_RELATION'; END IF;
 END IF;
 IF item.item_type='work_log' THEN
  IF (payload->>'duration_minutes')::integer NOT BETWEEN 1 AND 1440 OR payload->>'date' IS NULL THEN RAISE EXCEPTION 'RAW_REVIEW'; END IF;
  IF payload->>'worker_user_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users WHERE id=(payload->>'worker_user_id')::uuid AND is_active) THEN RAISE EXCEPTION 'RAW_RELATION'; END IF;
 END IF;
 UPDATE extraction_items SET reviewed_payload=payload,company_id=target_company,deal_id=target_deal,base_revision=deal.agent_revision,
  resolution_status='resolved',review_status='approved',reviewed_by=actor_id,reviewed_at=now() WHERE id=item_id;
 INSERT INTO audit_logs(user_id,action,target_type,target_id,after_json) VALUES(actor_id,'raw_review','extraction_item',item_id,jsonb_build_object('confirm_new',confirm_new));
END $$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION apply_raw_item(actor_id uuid,item_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE item extraction_items%ROWTYPE; actor users%ROWTYPE; deal deals%ROWTYPE; original raw_document_revisions%ROWTYPE;
 prior extraction_items%ROWTYPE; proposal uuid; payload jsonb; op jsonb; result jsonb; target_document uuid;
BEGIN
 SELECT * INTO actor FROM users WHERE id=actor_id AND is_active FOR SHARE;
 IF NOT FOUND OR actor.role NOT IN ('admin','member') THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 SELECT d.id INTO target_document FROM raw_documents d JOIN extraction_items i ON i.document_id=d.id
 WHERE i.id=item_id AND d.created_by=actor_id AND d.archived_at IS NULL FOR UPDATE OF d;
 IF NOT FOUND THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 SELECT * INTO item FROM extraction_items WHERE id=item_id FOR UPDATE;
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
  WHEN 'activity' THEN
   IF payload->>'date' IS NULL OR payload->>'activity_type' NOT IN ('call','email','meeting','visit','proposal','estimate','contract','support','note','other') THEN RAISE EXCEPTION 'RAW_REVIEW'; END IF;
   op:=jsonb_build_object('type','activity','summary',payload->>'title','body',payload->>'body','activity_date',payload->>'date','activity_type',payload->>'activity_type');
  WHEN 'task' THEN op:=jsonb_build_object('type','create_task','title',payload->>'title','description',payload->>'body','due_date',payload->>'due_date','priority','medium','assigned_to',NULL);
  WHEN 'decision' THEN op:=jsonb_build_object('type','decision','content',payload->>'title','rationale',payload->>'rationale','occurred_on',payload->>'date');
  ELSE RAISE EXCEPTION 'RAW_REVIEW';
 END CASE;
 INSERT INTO agent_change_requests(deal_id,extraction_item_id,reason,operations,before_state,base_revision)
 VALUES(item.deal_id,item.id,'Reviewed RAW extraction',jsonb_build_array(op),jsonb_build_object('deal',to_jsonb(deal),'raw_revision_id',original.id,'extraction_item_id',item.id),item.base_revision)
 RETURNING id INTO proposal;
 result:=apply_agent_changes(proposal,actor_id,jsonb_build_array(op));
 UPDATE extraction_items SET review_status='applied',applied_type=item.item_type,applied_id=(result->'results'->0->>'id')::uuid,applied_at=now() WHERE id=item.id;
 RETURN result;
END $$;
-- statement-breakpoint
