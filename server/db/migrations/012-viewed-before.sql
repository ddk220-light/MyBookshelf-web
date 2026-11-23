-- One-shelf Viewed before (plan 4.7 and section 9, rows 3 and 4). Every
-- account keeps its Viewed before list from the start: the history setting
-- now starts on, and entries no longer expire after 30 days. The list keeps
-- the newest 50 books (accounts/history.js) until the reader clears it or
-- deletes the account. There were no accounts when this was written (owner
-- decision), so existing rows are left as they are.
ALTER TABLE public.user_settings ALTER COLUMN history_enabled SET DEFAULT true;

-- Retention as in 011, without the 30-day expiry of recent_book_views.
CREATE OR REPLACE FUNCTION public.account_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.account_mail_jobs SET status='expired',payload='',"leaseUntil"=NULL,"leaseOwner"=NULL,"lastError"=NULL
  WHERE "expiresAt"<=statement_timestamp()+interval '10 seconds' AND status NOT IN ('sent','expired');
 DELETE FROM public.account_mail_jobs WHERE "createdAt"<statement_timestamp()-interval '2 days' AND status IN ('sent','expired');
 DELETE FROM public.guest_imports WHERE expires_at<=statement_timestamp();
 DELETE FROM public.account_operations WHERE expires_at<=statement_timestamp();
 DELETE FROM public.account_recent_proofs WHERE "expiresAt"<=statement_timestamp();
 DELETE FROM public.account_provider_intents WHERE "expiresAt"<=statement_timestamp();
 DELETE FROM public.account_email_challenges WHERE "expiresAt"<=statement_timestamp();
 DELETE FROM public."verification" WHERE "expiresAt"<=statement_timestamp();
 DELETE FROM public."session" WHERE "expiresAt"<=statement_timestamp() OR "createdAt"<=statement_timestamp()-interval '30 days';
 DELETE FROM public.account_rate_buckets WHERE reset_at<=statement_timestamp()-interval '24 hours';
 DELETE FROM public.account_deletions WHERE "cleanedAt"<statement_timestamp()-interval '35 days' AND "ledgerCompletedAt" IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.account_retention() FROM PUBLIC;
