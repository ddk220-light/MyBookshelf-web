-- Ciphertext expiry must continue even when the mail sender is unconfigured.
CREATE OR REPLACE FUNCTION public.account_retention()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE public.account_mail_jobs SET status='expired',payload='',"leaseUntil"=NULL,"leaseOwner"=NULL,"lastError"=NULL
  WHERE "expiresAt"<=statement_timestamp()+interval '10 seconds' AND status NOT IN ('sent','expired');
 DELETE FROM public.account_mail_jobs WHERE "createdAt"<statement_timestamp()-interval '2 days' AND status IN ('sent','expired');
 DELETE FROM public.recent_book_views WHERE viewed_at<=statement_timestamp()-interval '30 days';
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
