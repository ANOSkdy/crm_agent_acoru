CREATE TABLE extraction_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), raw_revision_id uuid NOT NULL REFERENCES raw_document_revisions(id),
 extraction_version text NOT NULL, schema_version text NOT NULL, prompt_version text NOT NULL, model text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 started_at timestamptz, completed_at timestamptz, error_code text, usage jsonb NOT NULL DEFAULT '{}',
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX extraction_run_version_idx ON extraction_runs(raw_revision_id,extraction_version,schema_version,prompt_version,model,created_at DESC);
-- statement-breakpoint
CREATE TABLE extraction_chunks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), extraction_run_id uuid NOT NULL REFERENCES extraction_runs(id),
 ordinal integer NOT NULL, start_offset integer NOT NULL, end_offset integer NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 attempt_id uuid, claimed_at timestamptz, attempts integer NOT NULL DEFAULT 0, error_code text,
 usage jsonb NOT NULL DEFAULT '{}', UNIQUE(extraction_run_id,ordinal), CHECK(end_offset>start_offset)
);
-- statement-breakpoint
CREATE TABLE extraction_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), extraction_run_id uuid NOT NULL REFERENCES extraction_runs(id),
 chunk_id uuid NOT NULL REFERENCES extraction_chunks(id), document_id uuid NOT NULL REFERENCES raw_documents(id),
 stable_item_key text NOT NULL, item_type text NOT NULL CHECK(item_type IN ('activity','task','decision')),
 operation text NOT NULL DEFAULT 'create' CHECK(operation='create'), proposed_payload jsonb NOT NULL,
 reviewed_payload jsonb, source_quote text NOT NULL, source_start_line integer NOT NULL, source_end_line integer NOT NULL,
 comparison text NOT NULL CHECK(comparison IN ('same','new','changed','ambiguous')),
 previous_item_id uuid REFERENCES extraction_items(id),
 resolution_status text NOT NULL CHECK(resolution_status IN ('resolved','needs_resolution')),
 review_status text NOT NULL CHECK(review_status IN ('pending','needs_resolution','approved','rejected','applied','conflict')),
 company_id uuid REFERENCES companies(id), deal_id uuid REFERENCES deals(id), base_revision integer,
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 applied_type text, applied_id uuid, applied_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(extraction_run_id,stable_item_key), CHECK(source_start_line>0 AND source_end_line>=source_start_line)
);
-- statement-breakpoint
CREATE INDEX extraction_item_document_key_idx ON extraction_items(document_id,stable_item_key);
-- statement-breakpoint
CREATE INDEX extraction_item_previous_idx ON extraction_items(previous_item_id);
-- statement-breakpoint
CREATE INDEX extraction_item_chunk_idx ON extraction_items(chunk_id);
-- statement-breakpoint
CREATE INDEX extraction_item_result_idx ON extraction_items(applied_type,applied_id);
-- statement-breakpoint
CREATE UNIQUE INDEX extraction_item_applied_once ON extraction_items(document_id,stable_item_key) WHERE applied_id IS NOT NULL;
-- statement-breakpoint
ALTER TABLE agent_change_requests ALTER COLUMN run_id DROP NOT NULL;
-- statement-breakpoint
ALTER TABLE agent_change_requests ADD COLUMN extraction_item_id uuid UNIQUE REFERENCES extraction_items(id);
-- statement-breakpoint
ALTER TABLE agent_change_requests ADD CONSTRAINT agent_change_one_source CHECK(num_nonnulls(run_id,extraction_item_id)=1);
-- statement-breakpoint
ALTER TABLE deal_decisions ADD COLUMN occurred_on date;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION start_raw_extraction(actor_id uuid,revision uuid,extract_version text,schema_ver text,prompt_ver text,model_name text,force_run boolean,chunks jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r raw_document_revisions%ROWTYPE; existing uuid; new_run uuid; part jsonb;
BEGIN
 SELECT r0.* INTO r FROM raw_document_revisions r0 JOIN raw_documents d ON d.id=r0.document_id
 JOIN users u ON u.id=actor_id AND u.is_active AND u.role IN ('admin','member')
 WHERE r0.id=revision AND d.created_by=actor_id AND d.archived_at IS NULL FOR UPDATE OF r0;
 IF NOT FOUND OR NOT r.ai_processing_allowed THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 IF NOT force_run THEN
  SELECT id INTO existing FROM extraction_runs WHERE raw_revision_id=revision AND extraction_version=extract_version
   AND schema_version=schema_ver AND prompt_version=prompt_ver AND model=model_name ORDER BY (status='succeeded') DESC,created_at DESC LIMIT 1;
  IF FOUND THEN RETURN existing; END IF;
 END IF;
 INSERT INTO extraction_runs(raw_revision_id,extraction_version,schema_version,prompt_version,model,created_by)
 VALUES(revision,extract_version,schema_ver,prompt_ver,model_name,actor_id) RETURNING id INTO new_run;
 FOR part IN SELECT value FROM jsonb_array_elements(chunks) LOOP
  INSERT INTO extraction_chunks(extraction_run_id,ordinal,start_offset,end_offset) VALUES(new_run,(part->>'ordinal')::integer,(part->>'start')::integer,(part->>'end')::integer);
 END LOOP;
 RETURN new_run;
END $$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION claim_raw_chunk(actor_id uuid,run uuid,retry_failed boolean)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE part extraction_chunks%ROWTYPE; allowed boolean; claim uuid:=gen_random_uuid();
BEGIN
 SELECT v.ai_processing_allowed INTO allowed FROM extraction_runs r JOIN raw_document_revisions v ON v.id=r.raw_revision_id
 JOIN raw_documents d ON d.id=v.document_id JOIN users u ON u.id=actor_id AND u.is_active AND u.role IN ('admin','member')
 WHERE r.id=run AND d.created_by=actor_id AND d.archived_at IS NULL FOR UPDATE OF r;
 IF NOT FOUND OR NOT allowed THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 UPDATE extraction_chunks SET status='failed',error_code='LEASE_EXPIRED',attempt_id=NULL WHERE extraction_run_id=run AND status='running' AND claimed_at<now()-interval '2 minutes';
 IF EXISTS(SELECT 1 FROM extraction_chunks WHERE extraction_run_id=run AND status='running') THEN RETURN NULL; END IF;
 IF retry_failed THEN UPDATE extraction_chunks SET status='queued',error_code=NULL WHERE extraction_run_id=run AND status='failed'; END IF;
 SELECT * INTO part FROM extraction_chunks WHERE extraction_run_id=run AND status='queued' ORDER BY ordinal LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE extraction_chunks SET status='running',attempt_id=claim,claimed_at=now(),attempts=attempts+1 WHERE id=part.id;
 UPDATE extraction_runs SET status='running',started_at=COALESCE(started_at,now()),completed_at=NULL,error_code=NULL WHERE id=run;
 RETURN jsonb_build_object('id',part.id,'start',part.start_offset,'end',part.end_offset,'attempt_id',claim);
END $$;
-- statement-breakpoint
CREATE OR REPLACE FUNCTION finish_raw_chunk(actor_id uuid,chunk uuid,attempt uuid,items jsonb,failure text,usage_data jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE part extraction_chunks%ROWTYPE; run extraction_runs%ROWTYPE; revision raw_document_revisions%ROWTYPE; item jsonb;
BEGIN
 SELECT r.* INTO run FROM extraction_runs r JOIN extraction_chunks c ON c.extraction_run_id=r.id
 JOIN users u ON u.id=actor_id AND u.is_active AND u.role IN ('admin','member')
 WHERE c.id=chunk AND r.created_by=actor_id FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'RAW_FORBIDDEN'; END IF;
 SELECT * INTO part FROM extraction_chunks WHERE id=chunk FOR UPDATE;
 IF part.status<>'running' OR part.attempt_id IS DISTINCT FROM attempt THEN RETURN false; END IF;
 SELECT * INTO revision FROM raw_document_revisions WHERE id=run.raw_revision_id;
 IF failure IS NULL THEN
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
   IF length(item->>'quote')=0 OR position(item->>'quote' IN revision.content)=0 THEN RAISE EXCEPTION 'RAW_SOURCE'; END IF;
   INSERT INTO extraction_items(extraction_run_id,chunk_id,document_id,stable_item_key,item_type,proposed_payload,source_quote,source_start_line,source_end_line,
     comparison,previous_item_id,resolution_status,review_status,company_id,deal_id,base_revision)
   VALUES(run.id,chunk,revision.document_id,item->>'key',item->>'type',item->'payload',item->>'quote',(item->>'start_line')::integer,(item->>'end_line')::integer,
     item->>'comparison',(item->>'previous_id')::uuid,item->>'resolution',CASE WHEN item->>'resolution'='resolved' THEN 'pending' ELSE 'needs_resolution' END,
     (item->>'company_id')::uuid,(item->>'deal_id')::uuid,(item->>'base_revision')::integer)
   ON CONFLICT(extraction_run_id,stable_item_key) DO NOTHING;
  END LOOP;
 END IF;
 UPDATE extraction_chunks SET status=CASE WHEN failure IS NULL THEN 'succeeded' ELSE 'failed' END,error_code=failure,usage=usage_data WHERE id=chunk;
 UPDATE extraction_runs SET
  status=CASE WHEN EXISTS(SELECT 1 FROM extraction_chunks WHERE extraction_run_id=run.id AND status='failed') THEN 'failed'
    WHEN EXISTS(SELECT 1 FROM extraction_chunks WHERE extraction_run_id=run.id AND status<>'succeeded') THEN 'running' ELSE 'succeeded' END,
  completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM extraction_chunks WHERE extraction_run_id=run.id AND status IN ('queued','running')) THEN now() ELSE NULL END,
  error_code=CASE WHEN EXISTS(SELECT 1 FROM extraction_chunks WHERE extraction_run_id=run.id AND status='failed') THEN 'CHUNK_FAILED' ELSE NULL END,
  usage=(SELECT COALESCE(jsonb_object_agg(key,total),'{}') FROM(SELECT key,sum(value::numeric) AS total FROM extraction_chunks c CROSS JOIN LATERAL jsonb_each_text(c.usage) WHERE c.extraction_run_id=run.id GROUP BY key) totals)
 WHERE id=run.id;
 RETURN true;
END $$;
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
 SELECT d.* INTO deal FROM deals d JOIN companies c ON c.id=d.company_id AND c.deleted_at IS NULL
 WHERE d.id=target_deal AND d.company_id=target_company AND d.deleted_at IS NULL FOR SHARE OF d;
 IF NOT FOUND OR NOT COALESCE(actor.role='admin' OR deal.owner_user_id=actor_id,false) THEN RAISE EXCEPTION 'RAW_RELATION'; END IF;
 UPDATE extraction_items SET reviewed_payload=payload,company_id=target_company,deal_id=target_deal,base_revision=deal.agent_revision,
  resolution_status='resolved',review_status='approved',reviewed_by=actor_id,reviewed_at=now() WHERE id=item_id;
 INSERT INTO audit_logs(user_id,action,target_type,target_id,after_json) VALUES(actor_id,'raw_review','extraction_item',item_id,jsonb_build_object('confirm_new',confirm_new));
END $$;
-- statement-breakpoint

CREATE OR REPLACE FUNCTION apply_agent_changes(change_id uuid, actor_id uuid, edited_operations jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  change_row agent_change_requests%ROWTYPE; deal_row deals%ROWTYPE; actor users%ROWTYPE;
  op jsonb; result_id uuid; results jsonb := '[]'::jsonb; target_deal uuid;
BEGIN
  SELECT deal_id INTO target_deal FROM agent_change_requests WHERE id = change_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
  SELECT * INTO deal_row FROM deals WHERE id = target_deal AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
  SELECT * INTO actor FROM users WHERE id = actor_id AND is_active = true FOR SHARE;
  IF NOT FOUND OR NOT COALESCE(actor.role = 'admin' OR (actor.role = 'member' AND deal_row.owner_user_id = actor_id), false) THEN RAISE EXCEPTION 'AGENT_FORBIDDEN'; END IF;
  SELECT * INTO change_row FROM agent_change_requests WHERE id = change_id FOR UPDATE;
  IF change_row.status = 'applied' THEN RETURN jsonb_build_object('status', 'applied', 'alreadyApplied', true); END IF;
  IF change_row.status <> 'pending' THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
  IF change_row.base_revision <> deal_row.agent_revision THEN RAISE EXCEPTION 'AGENT_CONFLICT'; END IF;
  IF jsonb_typeof(edited_operations) <> 'array' OR jsonb_array_length(edited_operations) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
  FOR op IN SELECT value FROM jsonb_array_elements(edited_operations) LOOP
    result_id := NULL;
    CASE op->>'type'
      WHEN 'progress' THEN
        INSERT INTO deal_contexts (deal_id, current_summary, health, blockers, next_review_date, updated_by)
        VALUES (target_deal, op->>'current_summary', op->>'health', op->>'blockers', (op->>'next_review_date')::date, actor_id)
        ON CONFLICT (deal_id) DO UPDATE SET current_summary = EXCLUDED.current_summary, health = EXCLUDED.health,
          blockers = EXCLUDED.blockers, next_review_date = EXCLUDED.next_review_date, updated_by = actor_id, updated_at = now();
      WHEN 'strategy' THEN
        INSERT INTO deal_contexts (deal_id, objective, current_strategy, updated_by)
        VALUES (target_deal, op->>'objective', op->>'strategy', actor_id)
        ON CONFLICT (deal_id) DO UPDATE SET objective = EXCLUDED.objective, current_strategy = EXCLUDED.current_strategy, updated_by = actor_id, updated_at = now();
        INSERT INTO deal_decisions (deal_id, content, rationale, decided_by)
        VALUES (target_deal, op->>'strategy', op->>'rationale', actor_id) RETURNING id INTO result_id;
      WHEN 'decision' THEN
        INSERT INTO deal_decisions(deal_id,content,rationale,decided_by,occurred_on) VALUES(target_deal,op->>'content',op->>'rationale',actor_id,(op->>'occurred_on')::date) RETURNING id INTO result_id;
      WHEN 'deal' THEN
        IF (op->>'probability')::integer NOT BETWEEN 0 AND 100 OR (op->>'amount')::numeric < 0 OR op->>'status' NOT IN ('open','won','lost') THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
        UPDATE deals SET stage_id = (op->>'stage_id')::uuid, status = op->>'status', probability = (op->>'probability')::integer,
          amount = (op->>'amount')::numeric, expected_close_date = (op->>'expected_close_date')::date, updated_at = now() WHERE id = target_deal;
      WHEN 'create_task' THEN
        IF op->>'priority' NOT IN ('low','medium','high') THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
        INSERT INTO tasks (company_id, deal_id, title, description, due_date, priority, assigned_to, created_by)
        VALUES (deal_row.company_id, target_deal, op->>'title', op->>'description', (op->>'due_date')::date, op->>'priority', CASE WHEN op ? 'assigned_to' THEN (op->>'assigned_to')::uuid ELSE actor_id END, actor_id) RETURNING id INTO result_id;
      WHEN 'complete_task' THEN
        UPDATE tasks SET status = 'done', completed_at = now(), updated_at = now()
        WHERE id = (op->>'task_id')::uuid AND deal_id = target_deal AND deleted_at IS NULL AND status <> 'done' RETURNING id INTO result_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
      WHEN 'activity' THEN
        INSERT INTO activities (company_id, deal_id, type, activity_date, summary, body, created_by)
        VALUES (deal_row.company_id, target_deal, op->>'activity_type', ((op->>'activity_date')::date::timestamp AT TIME ZONE 'Asia/Tokyo'), op->>'summary', op->>'body', actor_id) RETURNING id INTO result_id;
      ELSE RAISE EXCEPTION 'AGENT_INVALID';
    END CASE;
    results := results || jsonb_build_array(jsonb_build_object('type', op->>'type', 'id', result_id));
  END LOOP;
  UPDATE agent_change_requests SET status = 'applied', applied_at = now(), reviewed_by = actor_id, applied_operations = edited_operations WHERE id = change_id;
  INSERT INTO audit_logs (user_id, action, target_type, target_id, before_json, after_json)
  VALUES (actor_id, 'agent_apply', 'deal', target_deal, change_row.before_state, jsonb_build_object('change_id', change_id, 'operations', edited_operations, 'results', results));
  RETURN jsonb_build_object('status', 'applied', 'alreadyApplied', false, 'results', results);
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
