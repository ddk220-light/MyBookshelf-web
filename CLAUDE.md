# MyBookshelf web app

This is the active web source repository. Read AGENTS.md and docs/STATUS.md
first; docs/README.md indexes the recent analysis and design references.

Node 22, npm workspaces, React/Vite client and Express anonymous API (it also
uses a separate anonymous catalog store and log, never the account database).
The app is one screen (the shelf, with search, scan, library pop-up and side
panel as overlays); old /app/search, /app/libraries and /app/settings links
redirect to it. The app shows found / not found / couldn't check for the chosen
library, never copy counts, due dates, floors or shelf numbers.
Use README.md for commands. Run client/server tests, type checking, build, SEO
checks and browser journeys before releasing. Provider keys stay server-side.
The full directory remains usable in the app; shared/seo-libraries.json controls
only public library pages. Never treat failed checks as absence or merge editions
for identity or availability from similar titles (search cards may group
same-title, same-author records for display only). Respect catalog access restrictions and reduced motion.
Search text may be stored only in the anonymous operational log (no account ID,
IP or device identifier; 12 months, then totals). Never put it in URLs, browser
storage, platform logs or analytics, and never link any log to an account.
