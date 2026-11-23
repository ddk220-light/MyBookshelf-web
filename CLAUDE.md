# MyBookshelf web app

Read AGENTS.md first: it has the commands, the layout and the product rules.
README.md has the full verification list.

In short: Node 22, npm workspaces, React/Vite client and an Express anonymous
API. A library check shows found / not found / couldn't check for the chosen
library, never copy counts, due dates, floors or shelf numbers, and a failed
check never means absent. Provider keys stay server-side. Search text never goes
in URLs, browser storage, platform logs or analytics. Respect catalog access
restrictions, robots.txt and reduced motion. Indian libraries are offered only
when `server/data/india-catalogs-listed.json` lists them.
