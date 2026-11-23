-- Reject-only revocation recheck under the already-held owner lock. Returning a
-- boolean avoids a second auth-pool lease while a reading connection holds the
-- lifecycle lock; otherwise waiting auth requests can exhaust that pool.
-- Auth tables remain unreadable to the reading role. No token is accepted or
-- returned, and the application still verifies the cookie with Better Auth.
CREATE FUNCTION public.account_session_active(expected_session text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."session" s
    JOIN public.app_users a ON a.auth_user_id=s."userId"
    JOIN public."user" u ON u.id=s."userId"
    WHERE a.id=nullif(current_setting('mybookshelf.user_id',true),'')::uuid
      AND a.status='active' AND u."emailVerified"
      AND s.id=expected_session AND s."expiresAt">statement_timestamp()
      AND s."createdAt">statement_timestamp()-interval '30 days'
  )
$$;
REVOKE ALL ON FUNCTION public.account_session_active(text) FROM PUBLIC;
