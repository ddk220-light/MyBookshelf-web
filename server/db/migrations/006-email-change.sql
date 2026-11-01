-- Application challenge context. Auth token signing/verification stays owned by
-- the pinned library. These fields bind new-email verification to its request.
ALTER TABLE account_email_challenges ADD COLUMN "sessionId" text REFERENCES "session"(id) ON DELETE CASCADE;
ALTER TABLE account_email_challenges ADD COLUMN "targetEmail" text;
