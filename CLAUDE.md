# MyBookshelf web app

Read AGENTS.md first: it has the commands, the layout and the product rules.
README.md has the full verification list.

In short: Node 22, npm workspaces, React/Vite client and an Express anonymous
API. A library check shows found / not found / couldn't check for the chosen
library, never copy counts, due dates, floors or shelf numbers, and a failed
check never means absent. Provider keys stay server-side. Search text never goes
in URLs, browser storage, platform logs or analytics. The Google tag
(shared/google-tag.mjs) is Google's snippet, unmodified; its key events never
carry search text or the account. Respect catalog access
restrictions, robots.txt and reduced motion. Where a catalog's terms do not
allow storing availability (BiblioCommons, 23 November 2026;
server/data/catalog-policies.json), nothing is stored or cached for it: every
check is one live request. Indian libraries are offered only
when `server/data/india-catalogs-listed.json` lists them, US libraries only
when `server/data/us-catalogs-listed.json` lists them and does not remove them.
A catalog row with at least 80% of the title's words is a find, whatever its
format; the card lists up to 10, best match first (ISBN, the book's author,
exact main title, title start, other), books before e-books and audiobooks,
films and music last.
