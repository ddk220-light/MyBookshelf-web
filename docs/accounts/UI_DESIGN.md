# Account UI and integration specification

Version 0.2, 2026-11-01. D04. **Pre-artifact specification for R01.** Final visual
decisions await Claude's S22 artifact and R02. [UX](UX_DESIGN.md) owns interaction
meaning; [engineering](ENGINEERING_DESIGN.md) owns server contracts.

## Existing surfaces and proposed modules

The React 18/Vite app uses React Router in
[`App.tsx`](../../client/src/v2/App.tsx), a synchronous local persistence provider in
[`context.tsx`](../../client/src/v2/context.tsx), and settings in
[`SettingsPage.tsx`](../../client/src/v2/ui/settings/SettingsPage.tsx).
Introduce `auth/AccountSessionProvider`, `auth/accountClient`,
`storage/ReadingRepository`, `storage/GuestRepository`, `storage/AccountRepository`
and account components under `ui/account/`. Names are proposed module boundaries,
not files claimed to exist. Do not fork the reading pages into two implementations.

| Route | Screen / components | Contract and states |
| --- | --- | --- |
| `/app/account/sign-up` | AuthPage, SignupForm, ProviderButtons | signup; pending, validation, generic acknowledgement |
| `/app/account/sign-in` | SignInForm, ProviderButtons | sign-in; bad credentials, unverified, provider cancellation/collision |
| `/app/account/verify` | VerificationPanel | deliberate token continuation; success, expired, used, resend |
| `/app/account/forgot-password` | RecoveryForm | neutral request acknowledgement and throttling |
| `/app/account/reset-password` | ResetForm | token preflight, submit, expiry/replay, sign-in next |
| `/app/account/complete-profile` | PrivateNameForm | missing provider name; required before onboarding completion |
| `/app/account/return` | ProviderReturnPanel | transient status, safe return, failure/cancel; no tokens rendered |
| `/app/account/import` | GuestImportPreview, ImportResult | counts, library choice, separate history consent, capacity/conflict/failure |
| `/app/account/reauthenticate` | RecentAuthForm | password or existing provider, return to explicit sensitive-action confirmation |
| `/app/settings/account` | AccountDetails, LoginMethods, Sessions, HistoryControls, DataControls | profile/security/history/export/delete; pending, success and actionable failure |
| Existing `/app/settings` | AccountSummary + existing sections | guest/account/loading/unavailable text; reading lights remain local |
| Existing shelf/book/library pages | SyncNotice, async action controls | exact reference, pending/confirmed/error; stale data and retry |

Use same-origin Better Auth client methods for auth flows; exact endpoint names
come from the pinned version at S01. UI code uses an application adapter so it
does not duplicate auth protocol logic. Account-data calls use the proposed
`/api/account` contracts. All new app routes remain noindex; no sitemap entries.

## Identity and repository state machine

```text
unknown -> guest | unverified | authenticated(userId, epoch) | unavailable
authenticated -> switching -> authenticated(otherUserId, newEpoch) | guest
authenticated -> expired -> guest/sign-in prompt
authenticated -> signoutPending -> guest | signoutUnconfirmed
signoutUnconfirmed -> retry revocation | explicit localGuestOverride
```

`unknown`/`unavailable` must not infer a guest identity from a timeout. Anonymous
search remains accessible. Every private request captures `(userId, epoch)`;
response handlers check both before changing state. Identity change increments
epoch, aborts requests, clears optimistic/undo state, account caches and private
screen text, then selects the new repository. Aborting alone is insufficient:
already-resolved promises and cross-tab responses must fail the epoch check.

BroadcastChannel carries an identity-invalidation event, never tokens, emails,
books or profile data. Fall back to a nonce-only storage event; tabs refetch the
server session on visibility/focus even if broadcasts are unavailable. A small
non-sensitive `localGuestOverride` flag suppresses automatic account hydration
after failed sign-out; clear it only after confirmed revocation or explicit new
sign-in. Retry pending sign-out online before restoring private state.
Persist the flag in localStorage when available, with a sessionStorage fallback;
it contains no user ID or reading data. Handle storage failures explicitly and
revalidate on pageshow/bfcache restore. Never claim server revocation from a local
flag or promise that a flag survives browser storage being cleared.

`ReadingRepository` exposes asynchronous `loadSnapshot`, `selectLibrary`,
`saveBook`, `removeBook`, `undoRemove`, `clearSaved`, `recordView`, `removeView`,
`clearHistory`, `setHistoryEnabled` and `importGuest`. Result types distinguish
`confirmed`, `conflict`, `quota`, `unauthenticated`, `unavailable` and validation
failure. Guest methods wrap existing local behavior and recovery results. Account
methods carry revision/generation and idempotency metadata from server snapshots.
The shared provider owns pending state; pages never directly write localStorage.

## Persistence and cache inventory

| Existing or proposed state | Guest behavior | Signed-in behavior / identity transition |
| --- | --- | --- |
| `mybookshelf.anonymous-web.v1` | Existing selected library, saved/recent books and corruption recovery | Read only for explicit import preview; never write account mutations. Retain until explicit local cleanup. |
| `mybookshelf.reader-preferences.v1` | Shelf view/sort plus library summary | Split device presentation preferences from account-derived library summary; account summary stays in memory. Clear any legacy identity-derived summary on transition. |
| `mybookshelf.availability.v1` | Existing bounded cache | Memory-only account cache; never persist account-linked book/library lookup pairs. Clear memory and old derived caches on transition. |
| `mybookshelf.lookup-preferences.v1` | Existing per-book choices | Account per-book lookup choices stay in memory; clear on transition. No new sync requirement. |
| Reading-light and companion keys | Keep existing behavior | Preserve across identity changes; do not use blanket `localStorage.clear()`. |
| Auth state, private query cache, undo, import preview | No auth secrets persisted | Memory scoped to user/epoch; dispose on change. Only non-sensitive cross-tab/guest-override flags persist. |
| [`searchMemory.ts`](../../client/src/v2/searchMemory.ts) module caches and reader-state fallback memory | Existing session-local search/reader state | Include in the identity-reset inventory; add explicit reset hooks so prior queries/results and fallback reader data cannot reappear after account change. |

Account-derived book keys can also survive in URL/history and public page assets.
Sign-out replaces sensitive account routes with a guest destination and blanks
private component state. The privacy copy does not promise to erase browser
history, downloads or independently retained guest data.

## Mutation behavior

Use server-confirmed updates initially. Show “Saving…” without a saved-state
success claim; keep only the affected action disabled. Confirmed removal exposes
Undo for 10 seconds, keyed to the returned shelf revision. A later mutation or
clear invalidates Undo. A lost response reuses the same operation ID; a user retry
after conflict first fetches new state and uses a new operation ID. Never retry a
destructive action automatically after reauthentication.

Account revalidation on route entry, focus and mutations has one in-flight fetch
per resource/epoch. No background live-sync promise or offline queue. Stale
authenticated data may remain with “Couldn't refresh” until identity expires;
unverified/expired/switched identity immediately hides all private data.

History records only deliberate BookPage opening while visible and enabled;
deduplicate repeated renders. Toggle/pause/clear results update generation before
future events. Import previews use a frozen guest snapshot and server capacities;
after acknowledgement, remove only unchanged imported local entries if requested,
preserving books another guest tab added during import.

Deletion generates a receipt nonce before submitting the confirmed action and
keeps it in memory. After immediate session revocation, use the status-only receipt
contract to resolve a lost response; distinguish pending cleanup from completed
erasure. Do not reauthenticate and resubmit a second deletion merely to check
whether the first was accepted.

## Visual system and component acceptance

Use the existing [approved design decisions](../seo/IMPLEMENTATION_PLAN.md),
[reference package](../design/2026-10-mobile/README.md),
[`reader.css`](../../client/src/v2/reader.css) and
[`reading-room.css`](../../client/src/v2/reading-room.css).
Reuse `--serif`, `--sans`, `--surface`, `--paper`, `--ink-title`, `--ink-body`,
`--ink-muted`, `--line` and existing spacing/typography tokens. Preserve current
serif headings and system/Work Sans body fallback; do not introduce another font
download or invent provider-button styles that violate provider branding.

Forms: single column, proposed maximum 28rem, flexible width with existing page
gutters. Settings: proposed maximum 48rem, grouped sections and clearly separated
destructive controls. These dimensions are proposals for Claude to refine, not
pixel-match claims. Mobile has no horizontally scrolling tables; sessions become
stacked rows. Long names/emails wrap, labels stay visible, password controls do
not overlay input text. Loading reserves space to avoid layout shifts.

Every component supports daylight, lamplight and ink; focus, errors and pending
states need text/icon meaning beyond color. Test 320, 390, 768 and 1440px layouts,
200% zoom, 400% reflow equivalent, reduced motion and forced-colors focus. Check
contrast on actual rendered tokens, not color names. Touch targets are at least
44×44px; input text is at least 16px to avoid mobile zoom surprises.

Auth forms have visible labels, associated error/hint IDs, accessible password
visibility and semantic submit behavior. `ConfirmDialog` can be reused only after
checking async pending/error focus behavior; existing synchronous confirmation
handlers must await acknowledgements. Export errors do not repeatedly open downloads.

## Artifact reconciliation and implementation handoff

S22 maps each UX-01–11 flow and route above to an inspectable artifact screen/state.
Record approved visual choices, missing states and deviations in UI_ARTIFACT.md.
Update this specification and the affected tasks before R02. T04 compares the
implementation to that exact approved source and documents intentional differences;
automated screenshots alone do not demonstrate accessibility or fidelity.
