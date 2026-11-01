-- App recent-auth model generated with Better Auth 1.7.14.
create table "account_recent_proofs" ("id" text not null primary key, "digest" text not null unique, "authUserId" text not null, "sessionId" text not null references "session" ("id") on delete cascade, "action" text not null, "expiresAt" timestamptz not null, "verifiedAt" timestamptz, "consumedAt" timestamptz, "emailDigest" text, "createdAt" timestamptz not null);

create index "account_recent_proofs_authUserId_idx" on "account_recent_proofs" ("authUserId");
