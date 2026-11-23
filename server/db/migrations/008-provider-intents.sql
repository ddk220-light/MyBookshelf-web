CREATE TABLE account_provider_intents (
 id text PRIMARY KEY,
 "authUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 "sessionId" text NOT NULL REFERENCES "session"(id) ON DELETE CASCADE,
 mode text NOT NULL CHECK(mode IN ('link','reauth')),
 provider text NOT NULL CHECK(provider IN ('google','apple')),
 action text NOT NULL,
 target text,
 "expiresAt" timestamptz NOT NULL,
 "verifiedAt" timestamptz,
 "consumedAt" timestamptz,
 "createdAt" timestamptz NOT NULL
);
CREATE INDEX account_provider_intents_expiry ON account_provider_intents("expiresAt");
REVOKE ALL ON account_provider_intents FROM PUBLIC;
