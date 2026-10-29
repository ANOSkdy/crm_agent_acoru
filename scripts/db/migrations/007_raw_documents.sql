CREATE TABLE raw_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK(source_type IN ('paste','upload','local_sync')),
  source_key text NOT NULL,
  original_filename text, relative_path text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
  UNIQUE(created_by,source_type,source_key)
);
-- statement-breakpoint
CREATE INDEX raw_documents_owner_time ON raw_documents(created_by,updated_at DESC,id);
-- statement-breakpoint
CREATE TABLE raw_document_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES raw_documents(id),
  revision_no integer NOT NULL CHECK(revision_no>0), content text NOT NULL CHECK(octet_length(content)<=262144),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  observed_at date, ingested_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES users(id),
  ai_processing_allowed boolean NOT NULL DEFAULT false,
  UNIQUE(document_id,revision_no), UNIQUE(document_id,content_hash)
);
-- statement-breakpoint
CREATE FUNCTION preserve_raw_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RAW_IMMUTABLE'; END IF;
 IF (to_jsonb(NEW)-'ai_processing_allowed') IS DISTINCT FROM (to_jsonb(OLD)-'ai_processing_allowed') THEN RAISE EXCEPTION 'RAW_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
-- statement-breakpoint
CREATE TRIGGER raw_revision_immutable BEFORE UPDATE OR DELETE ON raw_document_revisions FOR EACH ROW EXECUTE FUNCTION preserve_raw_revision();
-- statement-breakpoint
CREATE FUNCTION ingest_raw_document(actor uuid, source_kind text, source_identity text, filename text, source_path text, body text, observed date, ai_allowed boolean, expected_document uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE doc raw_documents%ROWTYPE; rev raw_document_revisions%ROWTYPE; hash text; is_new boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND is_active AND role IN ('admin','member')) THEN RAISE EXCEPTION 'AGENT_FORBIDDEN'; END IF;
 IF source_kind NOT IN ('paste','upload','local_sync') OR length(source_identity) NOT BETWEEN 1 AND 200 OR octet_length(body) NOT BETWEEN 1 AND 262144 THEN RAISE EXCEPTION 'AGENT_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||source_kind||source_identity,0));
 SELECT * INTO doc FROM raw_documents WHERE created_by=actor AND source_type=source_kind AND source_key=source_identity FOR UPDATE;
 IF NOT FOUND THEN
   IF expected_document IS NOT NULL THEN RAISE EXCEPTION 'AGENT_CONFLICT'; END IF;
   INSERT INTO raw_documents(source_type,source_key,original_filename,relative_path,created_by) VALUES(source_kind,source_identity,filename,source_path,actor) RETURNING * INTO doc;
   is_new:=true;
 ELSIF doc.archived_at IS NOT NULL OR (expected_document IS NOT NULL AND doc.id<>expected_document) THEN RAISE EXCEPTION 'AGENT_CONFLICT';
 END IF;
 hash:=encode(sha256(convert_to(body,'UTF8')),'hex');
 SELECT * INTO rev FROM raw_document_revisions WHERE document_id=doc.id AND content_hash=hash;
 IF FOUND THEN
   UPDATE raw_documents SET original_filename=filename,relative_path=source_path,updated_at=CASE WHEN relative_path IS DISTINCT FROM source_path OR original_filename IS DISTINCT FROM filename THEN now() ELSE updated_at END WHERE id=doc.id;
   RETURN jsonb_build_object('status','unchanged','document_id',doc.id,'revision_id',rev.id,'content_hash',hash);
 END IF;
 INSERT INTO raw_document_revisions(document_id,revision_no,content,content_hash,observed_at,created_by,ai_processing_allowed)
 VALUES(doc.id,(SELECT coalesce(max(revision_no),0)+1 FROM raw_document_revisions WHERE document_id=doc.id),body,hash,observed,actor,ai_allowed) RETURNING * INTO rev;
 UPDATE raw_documents SET updated_at=now(),original_filename=filename,relative_path=source_path WHERE id=doc.id;
 INSERT INTO audit_logs(user_id,action,target_type,target_id,after_json) VALUES(actor,'raw_ingest','raw_revision',rev.id,jsonb_build_object('document_id',doc.id,'revision_no',rev.revision_no));
 RETURN jsonb_build_object('status',CASE WHEN is_new THEN 'created_document' ELSE 'created_revision' END,'document_id',doc.id,'revision_id',rev.id,'content_hash',hash);
END $$;
-- statement-breakpoint
