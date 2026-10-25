BEGIN;
CREATE FUNCTION pg_temp.expect_error(statement text, expected text) RETURNS void
LANGUAGE plpgsql AS $test$
BEGIN
  BEGIN
    EXECUTE statement;
    RAISE EXCEPTION 'Expected SQLSTATE %, but statement succeeded', expected;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected THEN RAISE; END IF;
  END;
END
$test$;
DO $structure$
BEGIN
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'qmenux') <> 6
    OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='qmenux' AND c.relrowsecurity AND c.relforcerowsecurity) <> 5
    OR EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='qmenux' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='qmenux_runtime')) THEN
    RAISE EXCEPTION 'Unexpected structure or runtime ownership';
  END IF;
END
$structure$;
INSERT INTO qmenux.tenants(id,slug,name) VALUES
  ('00000000-0000-4000-8000-000000000001','synthetic-cafe','Synthetic café A'),
  ('00000000-0000-4000-8000-000000000002','synthetic-restaurant','Synthetic restaurant B');
INSERT INTO qmenux.branches(tenant_id,id,name) VALUES
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A'),
  ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','B');
INSERT INTO qmenux.menus(tenant_id,id,branch_id,name) VALUES
  ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A'),
  ('00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','B');
INSERT INTO qmenux.categories(tenant_id,id,menu_id,name) VALUES
  ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','A'),
  ('00000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','B');
INSERT INTO qmenux.products(tenant_id,id,category_id,name,price_minor) VALUES
  ('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Synthetic draft A',1500),
  ('00000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Synthetic draft B',2000);
DO $defaults$
BEGIN
  IF EXISTS (SELECT FROM qmenux.tenants WHERE status <> 'PENDING_APPROVAL')
    OR EXISTS (SELECT FROM qmenux.menus WHERE state <> 'DRAFT')
    OR EXISTS (SELECT FROM qmenux.products WHERE currency <> 'TRY') THEN
    RAISE EXCEPTION 'Unsafe defaults';
  END IF;
END
$defaults$;
SELECT pg_temp.expect_error(format('INSERT INTO qmenux.tenants(slug,name) VALUES (%L,''synthetic'')',slug),'23514')
  FROM unnest(ARRAY['admin','superman','api','www','auth','assets','qmenux']) AS slug;
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.tenants(slug,name) VALUES ('Uppercase','synthetic')$q$,'23514');
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.tenants(slug,name) VALUES ('xn--synthetic','synthetic')$q$,'23514');
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.tenants(slug,name) VALUES ('synthetic-cafe','duplicate')$q$,'23505');
SELECT pg_temp.expect_error($q$UPDATE qmenux.menus SET state='PUBLISHED'$q$,'23514');
GRANT qmenux_runtime TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE qmenux_runtime;
SELECT set_config('app.tenant_id','',true);
DO $missing$
DECLARE table_name text; count_rows bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenants','branches','menus','categories','products'] LOOP
    EXECUTE format('SELECT count(*) FROM qmenux.%I',table_name) INTO count_rows;
    IF count_rows <> 0 THEN RAISE EXCEPTION 'Missing context exposed %',table_name; END IF;
  END LOOP;
END
$missing$;
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.branches(tenant_id,name) VALUES ('00000000-0000-4000-8000-000000000001','denied')$q$,'42501');
SELECT set_config('app.tenant_id','invalid-uuid',true);
SELECT pg_temp.expect_error('SELECT * FROM qmenux.products','22P02');
SELECT set_config('app.tenant_id','00000000-0000-4000-8000-000000000001',true);
DO $isolation$
DECLARE table_name text; tenants uuid[];
BEGIN
  IF (SELECT array_agg(id) FROM qmenux.tenants) IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000001'::uuid] THEN
    RAISE EXCEPTION 'Tenant row isolation failed';
  END IF;
  FOREACH table_name IN ARRAY ARRAY['branches','menus','categories','products'] LOOP
    EXECUTE format('SELECT array_agg(tenant_id) FROM qmenux.%I',table_name) INTO tenants;
    IF tenants IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000001'::uuid] THEN
      RAISE EXCEPTION 'Tenant A isolation failed for %',table_name;
    END IF;
  END LOOP;
END
$isolation$;
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.branches(tenant_id,name) VALUES ('00000000-0000-4000-8000-000000000002','denied')$q$,'42501');
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.menus(tenant_id,branch_id,name) VALUES ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','denied')$q$,'23503');
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.categories(tenant_id,menu_id,name) VALUES ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','denied')$q$,'23503');
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.products(tenant_id,category_id,name,price_minor) VALUES ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','denied',100)$q$,'23503');
SELECT pg_temp.expect_error($q$UPDATE qmenux.products SET tenant_id='00000000-0000-4000-8000-000000000002'$q$,'42501');
SELECT pg_temp.expect_error($q$UPDATE qmenux.tenants SET status='ACTIVE'$q$,'42501');
SELECT pg_temp.expect_error($q$INSERT INTO qmenux.tenants(slug,name) VALUES ('denied','denied')$q$,'42501');
SELECT pg_temp.expect_error($q$UPDATE qmenux.menus SET state='PUBLISHED'$q$,'42501');
SELECT pg_temp.expect_error($q$CREATE TABLE qmenux.denied(id integer)$q$,'42501');
SELECT pg_temp.expect_error('SELECT * FROM qmenux.schema_migrations','42501');
SELECT pg_temp.expect_error('TRUNCATE qmenux.products','42501');
SELECT pg_temp.expect_error('UPDATE qmenux.products SET price_minor=-1','23514');
SELECT pg_temp.expect_error($q$UPDATE qmenux.products SET currency='USD'$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE qmenux.products SET name=' '$q$,'23514');
SELECT pg_temp.expect_error($q$UPDATE qmenux.products SET availability='INVALID'$q$,'23514');
SELECT pg_temp.expect_error('UPDATE qmenux.products SET sort_order=-1','23514');
INSERT INTO qmenux.products(tenant_id,id,category_id,name,price_minor) VALUES
  ('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','Synthetic draft',0);
UPDATE qmenux.products SET availability='SOLD_OUT' WHERE id='40000000-0000-4000-8000-000000000003';
DO $crud$
BEGIN
  IF (SELECT availability FROM qmenux.products WHERE id='40000000-0000-4000-8000-000000000003') IS DISTINCT FROM 'SOLD_OUT'
    OR (SELECT count(*) FROM qmenux.products WHERE tenant_id='00000000-0000-4000-8000-000000000002') <> 0 THEN
    RAISE EXCEPTION 'Own CRUD or foreign read failed';
  END IF;
  DELETE FROM qmenux.products WHERE id='40000000-0000-4000-8000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'Foreign delete succeeded'; END IF;
  UPDATE qmenux.products SET name='denied' WHERE id='40000000-0000-4000-8000-000000000002';
  IF FOUND THEN RAISE EXCEPTION 'Foreign update succeeded'; END IF;
  DELETE FROM qmenux.products WHERE id='40000000-0000-4000-8000-000000000003';
  IF NOT FOUND THEN RAISE EXCEPTION 'Own delete failed'; END IF;
END
$crud$;
SELECT set_config('app.tenant_id','00000000-0000-4000-8000-000000000002',true);
DO $tenant_b$
BEGIN
  IF (SELECT array_agg(tenant_id) FROM qmenux.products) IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-000000000002'::uuid] THEN
    RAISE EXCEPTION 'Tenant B isolation failed';
  END IF;
END
$tenant_b$;
ROLLBACK;
SELECT 'PASS: defaults, constraints, composite FKs, RLS and restricted runtime CRUD' AS result;
