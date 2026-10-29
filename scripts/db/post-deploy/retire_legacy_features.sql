-- Run only AFTER the application removing the legacy routes has been deployed.
-- Migration 013 deliberately preserves these objects for the running old application.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP VIEW IF EXISTS crm_live_activities;
DROP VIEW IF EXISTS crm_ai_records;
DROP FUNCTION IF EXISTS apply_agent_changes(uuid, uuid, jsonb);
COMMIT;
