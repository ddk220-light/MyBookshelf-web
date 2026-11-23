-- The front-page check (owner decision, 23 November 2026: "You can check
-- yourself"; USA plan, Phase 0 item 7). For a catalog host that allows the
-- app in robots.txt but whose wall is unknown (it blocks AI agents, so no
-- agent may look), the app's own server asks for the host's front page once,
-- as MyBookshelf/1.0 with its contact URL, after robots.txt allows it, with no
-- search (catalog-store/frontPageCheck.js). This keeps one row per host: what
-- came back (the HTTP status, whether a bot wall or challenge was seen, a
-- redirect to another host) and when. No page content, header, cookie or
-- address of ours is kept.

CREATE TABLE IF NOT EXISTS host_front_page_checks (
  host          text PRIMARY KEY CHECK (length(host) BETWEEN 1 AND 253),
  checked_at    timestamptz NOT NULL DEFAULT now(),
  outcome       text NOT NULL CHECK (outcome IN ('pending', 'open', 'wall', 'refused', 'rate_limited', 'moved', 'not_found',
                  'server_error', 'unreachable', 'robots_disallowed', 'robots_unavailable', 'redirect_loop')),
  status        smallint CHECK (status BETWEEN 100 AND 599),
  robots_status smallint CHECK (robots_status BETWEEN 100 AND 599),
  wall          boolean NOT NULL DEFAULT false,
  wall_signal   text CHECK (length(wall_signal) <= 40),
  moved_to      text CHECK (length(moved_to) <= 253),
  duration_ms   integer CHECK (duration_ms >= 0)
);
