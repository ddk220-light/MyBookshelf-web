-- Catalog store grants (plan 4.1). Run with the migration (owner) role after
-- `npm run catalog:migrate --workspace=server`. Create the LOGIN roles and
-- their passwords privately in the database provider's console; no passwords
-- in SQL. Roles that do not exist yet are skipped, so this file can be re-run
-- after each role is created. None of these roles may own the tables or have
-- SUPERUSER or BYPASSRLS.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'catalog_runtime') THEN
    GRANT USAGE ON SCHEMA public TO catalog_runtime;
    GRANT SELECT, INSERT, UPDATE ON holdings_answers TO catalog_runtime;
    GRANT SELECT, INSERT, UPDATE ON library_profiles TO catalog_runtime;
    GRANT SELECT, INSERT, UPDATE ON library_health TO catalog_runtime;
    -- Reading the last week's failure times for the flag rule (5.5).
    GRANT SELECT, INSERT ON library_check_events TO catalog_runtime;
    GRANT INSERT ON usage_events TO catalog_runtime;
    -- Upsert needs SELECT on the conflict target; the runtime never lists requests.
    GRANT SELECT (request_key, request_count), INSERT, UPDATE (request_count, last_requested_on, updated_at) ON library_requests TO catalog_runtime;
    GRANT INSERT ON problem_reports TO catalog_runtime;
    GRANT SELECT, INSERT, UPDATE ON submission_buckets TO catalog_runtime;
    GRANT SELECT, INSERT, UPDATE ON host_request_windows, host_request_slots TO catalog_runtime;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO catalog_runtime;
    REVOKE ALL ON usage_daily_totals, catalog_schema_migrations FROM catalog_runtime;
    REVOKE SELECT ON usage_events, problem_reports FROM catalog_runtime;
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'catalog_worker') THEN
    GRANT USAGE ON SCHEMA public TO catalog_worker;
    -- The daily job (4.4). DELETE with a WHERE clause needs SELECT on the
    -- filtered columns; the rollup reads usage_events and the flag refresh
    -- updates library_health.
    GRANT SELECT, DELETE ON holdings_answers, problem_reports, library_requests, submission_buckets,
      library_check_events, usage_events, host_request_windows, host_request_slots TO catalog_worker;
    GRANT SELECT, INSERT, UPDATE ON usage_daily_totals TO catalog_worker;
    GRANT SELECT, UPDATE (checks_7d, failures_7d, median_ms_7d, flagged_at, flag_reason, updated_at) ON library_health TO catalog_worker;
    REVOKE ALL ON catalog_schema_migrations FROM catalog_worker;
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'catalog_admin') THEN
    -- Owner-only admin view (plan section 6, a later phase).
    GRANT USAGE ON SCHEMA public TO catalog_admin;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO catalog_admin;
    GRANT UPDATE (status, status_note, updated_at) ON library_requests TO catalog_admin;
    GRANT UPDATE (status, resolved_at) ON problem_reports TO catalog_admin;
    GRANT UPDATE (acknowledged_at, owner_note, updated_at) ON library_health TO catalog_admin;
  END IF;
END $$;

-- Server-side statement limits per role. A pooled (transaction-mode)
-- connection cannot set statement_timeout at connect time, so it is set on the
-- role (pool.js omits it for `-pooler` hosts). Skipped with a notice if this
-- role may not alter the others.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'catalog_runtime') THEN
    ALTER ROLE catalog_runtime SET statement_timeout = '1500ms';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'catalog_worker') THEN
    ALTER ROLE catalog_worker SET statement_timeout = '30s';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Set statement_timeout for catalog_runtime (1500ms) and catalog_worker (30s) in the provider console.';
END $$;
