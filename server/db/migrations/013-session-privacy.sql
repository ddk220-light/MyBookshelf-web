-- No IP addresses or device identifiers are kept (privacy policy). The
-- sign-in library no longer records either on a session (auth/auth.js), so
-- the values recorded before are removed. Its per-address limiter keeps no
-- rows any more; the rows it kept were keyed by a plain address and go too.
UPDATE public."session" SET "ipAddress"=NULL,"userAgent"=NULL
 WHERE "ipAddress" IS NOT NULL OR "userAgent" IS NOT NULL;
DELETE FROM public."rateLimit";
