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
