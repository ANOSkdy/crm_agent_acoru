-- Databases created before migrate.sql can still have the old three-state CHECK.
-- Migration 013 added tasks_issue_status but did not replace this legacy CHECK.
-- Keep tasks_issue_status, which permits open/in_progress/done/not_needed.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
