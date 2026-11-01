-- Run explicitly with the migration administrator after migrations. Create LOGIN
-- roles and credentials privately via the database provider; no passwords in SQL.
-- Named roles must already exist and must not be table owners or BYPASSRLS.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO mybookshelf_auth, mybookshelf_reading;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", "session", "account", "verification", "rateLimit" TO mybookshelf_auth;
-- Auth guard provisions app identity and resolves auth-user mapping; reading
-- requests use the isolated reading role and transaction-local owner context.
GRANT SELECT, INSERT, UPDATE, DELETE ON app_users, user_settings TO mybookshelf_auth;
GRANT SELECT, INSERT ON book_refs TO mybookshelf_reading;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_users, user_settings, user_libraries, user_books, recent_book_views, guest_imports, account_operations TO mybookshelf_reading;
REVOKE ALL ON "user", "session", "account", "verification", "rateLimit", account_schema_migrations FROM mybookshelf_reading;
-- Auth runtime already owns the global auth boundary. It can resolve/provision
-- the private app identity, but has no grants to reading rows or snapshots.
DROP POLICY IF EXISTS auth_identity_service ON app_users;
CREATE POLICY auth_identity_service ON app_users TO mybookshelf_auth USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS auth_settings_service ON user_settings;
CREATE POLICY auth_settings_service ON user_settings TO mybookshelf_auth USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON account_rate_buckets TO mybookshelf_auth;
REVOKE ALL ON account_rate_buckets FROM mybookshelf_reading;
GRANT SELECT, INSERT, UPDATE, DELETE ON account_mail_jobs, account_email_challenges TO mybookshelf_auth;
REVOKE ALL ON account_mail_jobs, account_email_challenges FROM mybookshelf_reading;
-- Worker role and its grant are added when the scheduled worker is configured;
-- reading and auth roles remain distinct from that job-processing credential.
-- Apply this block after the private job worker role has been created.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='mybookshelf_worker') THEN
    GRANT USAGE ON SCHEMA public TO mybookshelf_worker;
    GRANT SELECT,INSERT,UPDATE,DELETE ON account_mail_jobs TO mybookshelf_worker;
    GRANT SELECT("expiresAt"),DELETE ON account_email_challenges TO mybookshelf_worker;
    GRANT SELECT(reset_at),DELETE ON account_rate_buckets TO mybookshelf_worker;
    REVOKE ALL ON "user","session","account","verification",user_books,recent_book_views FROM mybookshelf_worker;
  END IF;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON account_recent_proofs TO mybookshelf_auth;
REVOKE ALL ON account_recent_proofs FROM mybookshelf_reading;
GRANT EXECUTE ON FUNCTION public.account_session_active(text) TO mybookshelf_reading;
GRANT SELECT,INSERT,UPDATE,DELETE ON account_provider_intents TO mybookshelf_auth;
REVOKE ALL ON account_provider_intents FROM mybookshelf_reading;
GRANT SELECT,INSERT,UPDATE,DELETE ON account_deletions,account_provider_cleanup TO mybookshelf_auth;
REVOKE ALL ON account_deletions,account_provider_cleanup FROM mybookshelf_reading;
GRANT EXECUTE ON FUNCTION public.account_export_authorize(text,text,uuid) TO mybookshelf_reading;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='mybookshelf_worker') THEN
  GRANT SELECT,UPDATE,DELETE ON account_deletions,account_provider_cleanup TO mybookshelf_worker;
  GRANT SELECT,INSERT,UPDATE ON account_job_health TO mybookshelf_worker;
  GRANT EXECUTE ON FUNCTION public.account_retention() TO mybookshelf_worker;
 END IF;
END $$;
