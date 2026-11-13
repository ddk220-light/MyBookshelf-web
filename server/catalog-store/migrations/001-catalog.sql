-- Catalog store (plan 4.2). A separate database from accounts: no reader,
-- account, session, IP address, device identifier or coordinates anywhere.

-- Answers: "library X has (or does not have) book identity Y". Identities are
-- a library's own record, an ISBN-13 or an Open Library work ID; never a title.
CREATE TABLE holdings_answers (
  library_id     text NOT NULL CHECK (length(library_id) BETWEEN 1 AND 200),
  identity_kind  text NOT NULL CHECK (identity_kind IN ('isbn13','ol_work','catalog_record')),
  identity_value text NOT NULL CHECK (length(identity_value) BETWEEN 1 AND 300),
  answer         text NOT NULL CHECK (answer IN ('found','not_found')),
  evidence       text NOT NULL CHECK (evidence IN
                   ('exact_isbn','work_isbn','catalog_record','isbn_not_listed','work_no_match')),
  matched_isbn13 text CHECK (matched_isbn13 ~ '^97[89][0-9]{10}$'),
  catalog_url    text CHECK (length(catalog_url) <= 2000),
  checked_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  PRIMARY KEY (library_id, identity_kind, identity_value)
);
CREATE INDEX holdings_answers_expiry ON holdings_answers (expires_at);

-- What we have learned about each library's catalog (kept for later).
CREATE TABLE library_profiles (
  library_id                      text PRIMARY KEY CHECK (length(library_id) BETWEEN 1 AND 200),
  reports_availability            boolean,
  reports_availability_checked_at timestamptz,
  answers_stored                  bigint NOT NULL DEFAULT 0,
  last_answer_at                  timestamptz
);

-- Library health (decision 2). One row per failed or timed-out check; no book,
-- query, reader or IP. Successes only update library_health.
CREATE TABLE library_check_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  library_id   text NOT NULL CHECK (length(library_id) BETWEEN 1 AND 200),
  host         text NOT NULL CHECK (length(host) BETWEEN 1 AND 253),
  platform     text NOT NULL CHECK (length(platform) BETWEEN 1 AND 40),
  operation    text NOT NULL CHECK (operation IN ('book_check','marks','record_read')),
  failure      text NOT NULL CHECK (failure IN
                 ('timeout','unavailable','blocked','unrecognized','budget','configuration')),
  error_code   text CHECK (length(error_code) <= 64),
  duration_ms  integer NOT NULL CHECK (duration_ms >= 0),
  requests     smallint NOT NULL CHECK (requests >= 0),
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_check_events_recent ON library_check_events (library_id, occurred_at DESC);
CREATE INDEX library_check_events_age ON library_check_events (occurred_at);

CREATE TABLE library_health (
  library_id             text PRIMARY KEY CHECK (length(library_id) BETWEEN 1 AND 200),
  platform               text NOT NULL CHECK (length(platform) BETWEEN 1 AND 40),
  last_success_at        timestamptz,
  last_failure_at        timestamptz,
  last_failure           text,
  failures_since_success integer NOT NULL DEFAULT 0,
  checks_7d              integer NOT NULL DEFAULT 0,
  failures_7d            integer NOT NULL DEFAULT 0,
  median_ms_7d           integer,
  flagged_at             timestamptz,
  flag_reason            text CHECK (length(flag_reason) <= 200),
  acknowledged_at        timestamptz,
  owner_note             text CHECK (length(owner_note) <= 500),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_health_flagged ON library_health (flagged_at DESC) WHERE flagged_at IS NOT NULL;

-- Anonymous operational log (decision 5b, 4.6.2). There is no column for an
-- account ID, IP address, device identifier, session, cookie, user agent,
-- referrer or coordinates, and usageLog.js accepts only these fields.
CREATE TABLE usage_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_hour timestamptz NOT NULL,       -- truncated to the hour (UTC)
  kind          text NOT NULL CHECK (kind IN
                  ('book_search','book_check','result_marks','library_finder','near_me')),
  query_text    text CHECK (length(query_text) <= 200),
  library_id    text CHECK (length(library_id) <= 200),
  book_key      text CHECK (length(book_key) <= 512),
  outcome       text NOT NULL CHECK (length(outcome) <= 40),
  result_count  smallint CHECK (result_count >= 0),
  found_count   smallint CHECK (found_count >= 0),
  source        text CHECK (source IN ('stored','live','mixed','public_data')),
  duration_ms   integer CHECK (duration_ms >= 0),
  app_version   text CHECK (length(app_version) <= 64),
  CHECK (kind <> 'near_me' OR (query_text IS NULL AND book_key IS NULL)),
  CHECK (kind = 'book_check' OR book_key IS NULL),
  CHECK (kind <> 'book_check' OR query_text IS NULL)
);
CREATE INDEX usage_events_hour ON usage_events (occurred_hour);

-- What is left after 12 months: totals only, no text and no book keys.
CREATE TABLE usage_daily_totals (
  day          date NOT NULL,
  kind         text NOT NULL,
  library_id   text NOT NULL DEFAULT '',
  outcome      text NOT NULL,
  events       integer NOT NULL,
  results_sum  bigint NOT NULL DEFAULT 0,
  p50_ms       integer,
  p95_ms       integer,
  PRIMARY KEY (day, kind, library_id, outcome)
);

-- One-tap "Request to add <text>". Text and a count only (decision 5e).
CREATE TABLE library_requests (
  request_key        text PRIMARY KEY CHECK (length(request_key) BETWEEN 2 AND 80),
  display_text       text NOT NULL CHECK (length(display_text) BETWEEN 2 AND 80),
  request_count      integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  first_requested_on date NOT NULL DEFAULT current_date,
  last_requested_on  date NOT NULL DEFAULT current_date,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','added','declined','spam')),
  status_note        text CHECK (length(status_note) <= 500),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_requests_queue ON library_requests (status, request_count DESC, last_requested_on DESC);

-- Report a problem.
CREATE TABLE problem_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  screen      text CHECK (screen IN ('shelf','search','book','library','panel','account','scan','other')),
  library_id  text CHECK (length(library_id) <= 200),
  book_key    text CHECK (length(book_key) <= 512),
  app_version text CHECK (length(app_version) <= 64),
  created_at  timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','resolved','spam')),
  resolved_at timestamptz
);
CREATE INDEX problem_reports_queue ON problem_reports (status, created_at DESC);

-- Anonymous abuse limits: keyed HMAC digests, never raw IPs.
CREATE TABLE submission_buckets (
  bucket   bytea PRIMARY KEY CHECK (octet_length(bucket) = 32),
  count    integer NOT NULL CHECK (count > 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX submission_buckets_expiry ON submission_buckets (reset_at);

-- Cross-instance per-host request counter (5.4). One row per host per minute.
CREATE TABLE host_request_windows (
  host         text NOT NULL CHECK (length(host) BETWEEN 1 AND 253),
  window_start timestamptz NOT NULL,
  requests     integer NOT NULL CHECK (requests >= 0),
  PRIMARY KEY (host, window_start)
);
CREATE INDEX host_request_windows_age ON host_request_windows (window_start);

-- Addition to the plan's schema: the next free request slot per host, so a
-- spacing such as a robots Crawl-delay (Visakhapatnam: 20 s) holds across all
-- readers and instances. A per-minute counter alone cannot express spacing.
CREATE TABLE host_request_slots (
  host    text PRIMARY KEY CHECK (length(host) BETWEEN 1 AND 253),
  next_at timestamptz NOT NULL
);
