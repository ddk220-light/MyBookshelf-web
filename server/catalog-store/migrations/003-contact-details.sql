-- Optional contact details (production-ready plan, A4, backlog item 14).
-- A reader who wants a reply may leave a name and an email with a problem
-- report or a library request. Both are optional, are never linked to an
-- account, IP address or device, and are removed by the daily catalog
-- maintenance 90 days after they were left (maintenance.js).
--
-- Reports are one row each, so their details sit on the report. Requests are
-- merged into one row per text (library_requests.request_key), so each
-- reader's details for a request are a row of their own here.

ALTER TABLE problem_reports
  ADD COLUMN IF NOT EXISTS contact_name  text CHECK (length(contact_name) BETWEEN 1 AND 80),
  ADD COLUMN IF NOT EXISTS contact_email text CHECK (length(contact_email) BETWEEN 3 AND 254);

CREATE TABLE IF NOT EXISTS library_request_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key text NOT NULL REFERENCES library_requests (request_key) ON DELETE CASCADE,
  name        text CHECK (length(name) BETWEEN 1 AND 80),
  email       text CHECK (length(email) BETWEEN 3 AND 254),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (name IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS library_request_contacts_request ON library_request_contacts (request_key, created_at DESC);
CREATE INDEX IF NOT EXISTS library_request_contacts_age ON library_request_contacts (created_at);
