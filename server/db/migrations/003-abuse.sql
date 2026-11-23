-- Global anonymous abuse counters use keyed digests, never raw email/IP values.
CREATE TABLE account_rate_buckets (
  bucket text PRIMARY KEY CHECK (length(bucket) = 64),
  count integer NOT NULL CHECK (count > 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX expired_account_rate_buckets ON account_rate_buckets(reset_at);
