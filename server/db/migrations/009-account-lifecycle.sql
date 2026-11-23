CREATE TABLE account_deletions (
 id text PRIMARY KEY,
 "authUserId" text NOT NULL,
 "appUserId" uuid NOT NULL,
 "receiptDigest" text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending-ledger','queued','cleaned')),
 "requestedAt" timestamptz NOT NULL,
 "cleanedAt" timestamptz,
 "ledgerCompletedAt" timestamptz,
 "availableAt" timestamptz NOT NULL,
 "leaseUntil" timestamptz,
 "leaseOwner" text,
 attempts integer NOT NULL DEFAULT 0,
 "lastError" text
);
CREATE INDEX account_deletions_ready ON account_deletions("availableAt");
CREATE UNIQUE INDEX account_deletions_owner ON account_deletions("authUserId");
CREATE TABLE account_provider_cleanup (
 id text PRIMARY KEY,
 "authUserId" text NOT NULL,
 "deletionId" text,
 provider text NOT NULL CHECK(provider IN ('google','apple')),
 payload text NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','running','done','expired')),
 "availableAt" timestamptz NOT NULL,
 "expiresAt" timestamptz NOT NULL,
 "leaseUntil" timestamptz,
 "leaseOwner" text,
 attempts integer NOT NULL DEFAULT 0,
 "createdAt" timestamptz NOT NULL,
 "lastError" text
);
CREATE INDEX account_provider_cleanup_ready ON account_provider_cleanup("availableAt");
REVOKE ALL ON account_deletions,account_provider_cleanup FROM PUBLIC;

-- A narrow projection plus action-specific proof consumption. The reading role
-- receives neither auth-table grants nor session/provider credentials. An export
-- receipt permits the same request/session to retry for the proof's remaining
-- lifetime, without persisting an export copy or extending authorization.
CREATE FUNCTION public.account_export_authorize(expected_session text, expected_digest text, operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid; auth_id text; expires timestamptz; prior public.account_operations; result jsonb;
BEGIN
 owner_id:=nullif(current_setting('mybookshelf.user_id',true),'')::uuid;
 IF owner_id IS NULL OR NOT public.account_session_active(expected_session) OR expected_digest !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Recent authentication required' USING ERRCODE='P0001';
 END IF;
 SELECT a.auth_user_id INTO auth_id FROM public.app_users a WHERE a.id=owner_id AND a.status='active';
 SELECT * INTO prior FROM public.account_operations o WHERE o.user_id=owner_id AND o.operation_id=account_export_authorize.operation_id;
 IF FOUND THEN
  IF prior.result->>'kind' IS DISTINCT FROM 'export' OR prior.result->>'sessionId' IS DISTINCT FROM expected_session OR prior.payload_hash<>decode(expected_digest,'hex') OR prior.expires_at<=statement_timestamp() THEN
   RAISE EXCEPTION 'Export request expired' USING ERRCODE='P0001';
  END IF;
 ELSE
  UPDATE public.account_recent_proofs p SET "consumedAt"=statement_timestamp()
   WHERE p.digest=expected_digest AND p."authUserId"=auth_id AND p."sessionId"=expected_session AND p.action='export'
    AND p."verifiedAt" IS NOT NULL AND p."consumedAt" IS NULL AND p."expiresAt">statement_timestamp()
   RETURNING p."expiresAt" INTO expires;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recent authentication required' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.account_operations(user_id,operation_id,payload_hash,result,expires_at)
   VALUES(owner_id,account_export_authorize.operation_id,decode(expected_digest,'hex'),jsonb_build_object('kind','export','sessionId',expected_session),expires);
 END IF;
 SELECT jsonb_build_object('name',u.name,'email',u.email,'emailVerified',u."emailVerified",'createdAt',u."createdAt",
  'signInMethods',COALESCE((SELECT jsonb_agg(CASE WHEN a."providerId"='credential' THEN 'password' ELSE a."providerId" END ORDER BY a."providerId") FROM public.account a WHERE a."userId"=u.id AND a."providerId" IN ('credential','google','apple')),'[]'::jsonb))
  INTO result FROM public."user" u WHERE u.id=auth_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.account_export_authorize(text,text,uuid) FROM PUBLIC;
