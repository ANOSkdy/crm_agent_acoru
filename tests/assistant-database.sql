DO $$
DECLARE
  actor uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); t uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); thread1 uuid:=gen_random_uuid(); thread2 uuid:=gen_random_uuid();
BEGIN
  INSERT INTO users(id,name,email,role,password_hash) VALUES(actor,'search test','assistant@test.invalid','admin','not-for-ai');
  INSERT INTO companies(id,name,memo) VALUES(c,'横断検証会社','検索対象の会社メモ');
  INSERT INTO deals(id,company_id,title,amount,probability) VALUES(d,c,'横断検証案件',120000,50);
  INSERT INTO tasks(id,company_id,deal_id,title,due_date) VALUES(t,c,d,'期限の確認',(now() AT TIME ZONE 'Asia/Tokyo')::date-1);
  INSERT INTO activities(id,company_id,deal_id,type,activity_date,summary,body) VALUES(a,c,d,'meeting',now(),'商談打合せ','本文検索用の重要事項');
  INSERT INTO agent_threads(id,created_by,title) VALUES(thread1,actor,'全体の相談'),(thread2,actor,'別の相談');
  IF (SELECT count(*) FROM agent_threads WHERE created_by=actor AND deal_id IS NULL)<>2 THEN RAISE EXCEPTION 'Multiple global conversations unavailable'; END IF;
  IF (SELECT count(*) FROM crm_ai_records WHERE company_id=c)<>4 THEN RAISE EXCEPTION 'Cross-entity retrieval is incomplete'; END IF;
  IF NOT EXISTS(SELECT 1 FROM crm_ai_records WHERE body ILIKE '%重要事項%' AND kind='activity') THEN RAISE EXCEPTION 'Activity body not searchable'; END IF;
  IF EXISTS(SELECT 1 FROM crm_ai_records WHERE data::text LIKE '%not-for-ai%' OR data ? 'password_hash') THEN RAISE EXCEPTION 'Credentials leaked to retrieval view'; END IF;
  UPDATE deals SET deleted_at=now() WHERE id=d;
  IF EXISTS(SELECT 1 FROM crm_ai_records WHERE deal_id=d) THEN RAISE EXCEPTION 'Deleted deal or children available to AI'; END IF;
  UPDATE deals SET deleted_at=NULL WHERE id=d;
  UPDATE companies SET deleted_at=now() WHERE id=c;
  IF EXISTS(SELECT 1 FROM crm_ai_records WHERE company_id=c) THEN RAISE EXCEPTION 'Deleted company or children available to AI'; END IF;
END $$;
