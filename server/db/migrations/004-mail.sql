-- App mail models generated with Better Auth 1.7.14.
create table "account_mail_jobs" ("id" text not null primary key, "kind" text not null, "authUserId" text, "payload" text not null, "status" text not null, "attempts" integer not null, "availableAt" timestamptz not null, "leaseUntil" timestamptz, "leaseOwner" text, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "lastError" text);

create table "account_email_challenges" ("id" text not null primary key, "digest" text not null unique, "authUserId" text not null, "purpose" text not null, "expiresAt" timestamptz not null, "usedAt" timestamptz, "createdAt" timestamptz not null);

create index "account_mail_jobs_authUserId_idx" on "account_mail_jobs" ("authUserId");

create index "account_mail_jobs_status_idx" on "account_mail_jobs" ("status");

create index "account_mail_jobs_availableAt_idx" on "account_mail_jobs" ("availableAt");

create index "account_email_challenges_authUserId_idx" on "account_email_challenges" ("authUserId");
