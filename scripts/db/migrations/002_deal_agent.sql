ALTER TABLE deals ADD COLUMN IF NOT EXISTS agent_revision integer NOT NULL DEFAULT 0;
-- statement-breakpoint
CREATE TABLE deal_contexts (
  deal_id uuid PRIMARY KEY REFERENCES deals(id), objective text NOT NULL DEFAULT '',
  current_summary text NOT NULL DEFAULT '', health text NOT NULL DEFAULT 'unknown' CHECK (health IN ('unknown','on_track','at_risk','blocked')),
  blockers text NOT NULL DEFAULT '', current_strategy text NOT NULL DEFAULT '', next_review_date date,
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE deal_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deal_id uuid NOT NULL REFERENCES deals(id),
  content text NOT NULL, rationale text NOT NULL, decided_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX deal_decisions_deal_idx ON deal_decisions(deal_id, created_at DESC);
-- statement-breakpoint
CREATE TABLE agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deal_id uuid NOT NULL UNIQUE REFERENCES deals(id),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE agent_runs (
  id uuid PRIMARY KEY, thread_id uuid NOT NULL REFERENCES agent_threads(id), user_id uuid NOT NULL REFERENCES users(id),
  input text NOT NULL, status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  model text, usage jsonb NOT NULL DEFAULT '{}', error_message text,
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
-- statement-breakpoint
CREATE UNIQUE INDEX agent_runs_one_active ON agent_runs(thread_id) WHERE status = 'running';
-- statement-breakpoint
CREATE INDEX agent_runs_user_time ON agent_runs(user_id, created_at DESC);
-- statement-breakpoint
CREATE TABLE agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL REFERENCES agent_threads(id),
  run_id uuid NOT NULL REFERENCES agent_runs(id), role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL, sources jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id, role)
);
-- statement-breakpoint
CREATE INDEX agent_messages_thread_idx ON agent_messages(thread_id, created_at);
-- statement-breakpoint
CREATE TABLE agent_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deal_id uuid NOT NULL REFERENCES deals(id), run_id uuid NOT NULL UNIQUE REFERENCES agent_runs(id),
  reason text NOT NULL, operations jsonb NOT NULL CHECK (jsonb_typeof(operations) = 'array'), before_state jsonb NOT NULL, base_revision integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz, reviewed_by uuid REFERENCES users(id), applied_operations jsonb
);
-- statement-breakpoint
CREATE INDEX agent_changes_deal_idx ON agent_change_requests(deal_id, created_at DESC);
-- statement-breakpoint
CREATE OR REPLACE FUNCTION bump_deal_agent_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.agent_revision := OLD.agent_revision + 1; RETURN NEW; END $$;
-- statement-breakpoint
CREATE TRIGGER deals_agent_revision BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION bump_deal_agent_revision();
-- statement-breakpoint
CREATE OR REPLACE FUNCTION touch_agent_deal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.deal_id IS NOT NULL THEN
    UPDATE deals SET agent_revision = agent_revision + 1 WHERE id = OLD.deal_id;
  END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE deals SET agent_revision = agent_revision + 1 WHERE id = NEW.deal_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.deal_id IS DISTINCT FROM OLD.deal_id THEN
    UPDATE deals SET agent_revision = agent_revision + 1 WHERE id = NEW.deal_id;
  END IF;
  RETURN NULL;
END $$;
-- statement-breakpoint
CREATE TRIGGER tasks_agent_revision AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION touch_agent_deal();
-- statement-breakpoint
CREATE TRIGGER activities_agent_revision AFTER INSERT OR UPDATE OR DELETE ON activities FOR EACH ROW EXECUTE FUNCTION touch_agent_deal();
-- statement-breakpoint
CREATE TRIGGER context_agent_revision AFTER INSERT OR UPDATE OR DELETE ON deal_contexts FOR EACH ROW EXECUTE FUNCTION touch_agent_deal();
-- statement-breakpoint
CREATE TRIGGER decisions_agent_revision AFTER INSERT OR UPDATE OR DELETE ON deal_decisions FOR EACH ROW EXECUTE FUNCTION touch_agent_deal();
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
      WHEN 'deal' THEN
        IF (op->>'probability')::integer NOT BETWEEN 0 AND 100 OR (op->>'amount')::numeric < 0 OR op->>'status' NOT IN ('open','won','lost') THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
        UPDATE deals SET stage_id = (op->>'stage_id')::uuid, status = op->>'status', probability = (op->>'probability')::integer,
          amount = (op->>'amount')::numeric, expected_close_date = (op->>'expected_close_date')::date, updated_at = now() WHERE id = target_deal;
      WHEN 'create_task' THEN
        IF op->>'priority' NOT IN ('low','medium','high') THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
        INSERT INTO tasks (company_id, deal_id, title, description, due_date, priority, assigned_to, created_by)
        VALUES (deal_row.company_id, target_deal, op->>'title', op->>'description', (op->>'due_date')::date, op->>'priority', actor_id, actor_id) RETURNING id INTO result_id;
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
