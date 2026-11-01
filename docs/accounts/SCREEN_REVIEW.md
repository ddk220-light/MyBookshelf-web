# Account screen review

Reviewed 2026-11-01 against Claude canvas v4 (`1793518146-c9ad`), approved at
R02 / `36a1436`. The source is
[Main.dc.html](../design/accounts/claude-artifact/Main.dc.html), SHA-256
`879889ccd1179b6d11afc7d73f9ea9ba01c46cae1f9e09e83531d74b7a78df69`.
The source artifact is unchanged. Tested implementation: `56915a6785f26daa55b7ea684372a23875c136ee`; commands and
results are recorded in [VALIDATION.md](VALIDATION.md).

Each browser records 85 paired entries across 33 named screen/state cases, plus
twelve bottom settings pairs and separate stress captures. Eighteen applicable
artifact screens map to actual app captures; the external provider simulation is
deferred. The curated gallery retains thirteen pairs and three stress images.

Open the [paired screen gallery](evidence/ui-review/index.html) for selected
implemented/reference screens. Normal phone samples use a **390 CSS-pixel viewport
at 100% text size**. The subsequent owner review reduced phone account headings to
**28px**, retaining **16px body/input text**; desktop headings remain 32px.
The 200% text samples are labelled separately and demonstrate enlarged text,
not the default phone appearance.

## What was checked and repaired

The review uses the running app with native authentication, actual HTTP/cookies
and disposable Postgres roles. Successful private actions are real; controlled
network failures exercise pending, error and lost-response recovery. No external
mail or identity provider is needed for these checks.

- Entry forms now have the approved bounded column, 48px fields, integrated
  password reveal, private-name help and privacy/guest links. Account CSS loads
  after shared reader CSS so global rules cannot shrink fields or reset layout.
- Settings now uses bounded cards and clear rows, an inline name Save button,
  pending-email notice, device controls and a real history switch. Review import
  and Clear saved books are reachable from Your data. Password methods no longer
  offer the unsupported Disconnect action.
- A failed clear operation keeps its dialog open, focuses the error and retries
  the original operation from inside the modal. Success notices no longer appear
  as dialog errors. Separate guest books survive the account clear.
- An import whose response was lost can retry the original frozen request from
  the preview. Choices stay fixed until the result is known; the acknowledged
  counts and retained guest copy are verified after retry.
- Account result headings and document titles identify the current step. Error
  summaries link to invalid fields; equivalent error rerenders preserve field
  focus. Theme changes propagate to another open tab.
- Long private names and email addresses wrap safely. At 320px and 200% text,
  navigation labels wrap inside their targets and input text cannot run under
  password reveal. Native modal cancellation restores focus; pending destructive
  requests disable cancellation. Forced colors retain borders and focus cues.

## Reference mapping

The artifact contains nineteen screens. This table maps each to the real flow;
the review compares relevant structure and behavior, not fictional sample counts.

| Artifact screen | Implemented route or state |
| --- | --- |
| Settings, guest | `/app/settings`, optional account entry and device preferences |
| Create account | `/app/account/sign-up`, normal, field errors and submitting |
| Check your email | Signup/recovery neutral result; deliberate verification link |
| Verify link | `/app/account/verify`, explicit POST after link navigation |
| Sign in | `/app/account/sign-in`, normal and wrong-details error |
| Google or Apple | Real external redirect and protocol tests; activation deferred by owner |
| Add your name | `/app/account/complete-profile`, actual name-completion flow |
| Forgot password | `/app/account/forgot-password`, request and neutral result |
| New password | `/app/account/reset-password`, ready, updated and used-link error |
| Bring books over | `/app/account/import`, preview, lost response, retry and result |
| Recently viewed choice | Explicit off-by-default settings switch; pending, failure, retry, on and pause |
| Shelf while signed in | `/app/shelf`, acknowledged account save/import and refresh |
| Account settings | `/app/settings/account`, profile, methods, devices, history and data |
| Change email | Recent-auth dialog, new-address form, pending confirmation and cancellation |
| Confirm it's you | Action-bound native dialog before sensitive changes |
| Signing out | Private-state lock after lost response, retry, verified guest result |
| Export | Recent-auth dialog, private JSON download and download-started status |
| Delete account | Explicit final consent, cancellation; accepted/lost-response lifecycle in real journey suite |
| Clear saved books | Native confirmation, pending, focused failure and same-operation retry |

## Deliberate differences

The owner deferred Google/Apple activation, so their controls stay hidden when
server capabilities are false. The prototype's provider page is illustrative;
the app redirects to the real provider rather than reproducing that simulation.
No live provider success is claimed here.

The app keeps a dedicated Your account screen under Settings, preserving the
existing appearance, companion and support settings. Account settings cards follow
the artifact's hierarchy. History consent is offered in Settings, which is allowed
by UX-11; importing past history is a separate unchecked choice. Device labels,
counts and expiry messages reflect actual data, rather than the prototype's
invented second device and books. Existing navigation icons and Help remain.

The phone title size incorporates the owner's later typography feedback. The app
uses the existing Work Sans/Newsreader assets and reading-light tokens. Provider
controls are conditional and the approved source's sample row density therefore
differs from an email-only account. There is no numerical pixel-match claim.

Deletion includes explicit permanent-deletion consent and preserves independent
guest copies and downloaded files. Removing a guest copy requires the separate
acknowledged-import choice; account deletion never silently removes local books.
The final modal reflects the actual retention contract. Native modal focus,
progress/errors and scanner-safe link confirmation implement requirements the
canvas runtime cannot demonstrate. Export reports that the download started;
only the browser can confirm where the reader saved the file.

## Reproduce

Build once, start a fresh disposable harness as described in
[local account development](../../tools/accounts/README.md), then run one profile:

```sh
ACCOUNT_E2E=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:4300 \
  npm run test:e2e --workspace client -- accounts-real.spec.js accounts-visual.spec.js \
  --project=chromium --workers=2
```

Restart the harness and repeat for `mobile-chromium`, then `webkit`. The production
sign-in limiter stays enabled; combining all profiles behind one loopback IP can
exhaust it. CI follows the same fresh-process lifecycle. WebKit's repeated
screenshot/resize sequence retained the previous stylesheet media evaluation in a
standalone reproduction. Captures reassert normal screen media and then verify
the actual responsive CSS before taking the next image. Overflow checks remain
enabled. Sign-out assertions wait for server acknowledgement after private UI clears.

`accounts-visual.spec.js` writes paired PNGs and a `review/matrix.json` per project
under the Playwright output directory. Each entry records its source screen/state,
reading light, CSS width, DPR and measured default typography. Entry and settings
matrices cover 320, 390, 768 and 1440px in all three lights. Settings includes the
bottom data controls; deletion confirmation covers narrow phone/phone/desktop in
all lights. Selected failures, long strings, 200% text and forced colors extend
that matrix. A 320 CSS-pixel viewport also tests reflow at the width reached by
400% zoom from a 1280px desktop; it does not emulate every browser's zoom mechanism.

[artifact-reference.mjs](../../tools/accounts/artifact-reference.mjs) resolves the
checked-in canvas state class and conditional/repeated markup into static HTML,
retaining its CSS. It removes canvas review controls/events, fills the viewport
and embeds the local Newsreader font. This makes the source inspectable without
the unavailable canvas runtime; reference captures do not test canvas interaction
or substitute for actual app behavior. Mobile Chromium's physical PNG dimensions
reflect its DPR, not larger CSS text. The curated gallery uses DPR 1 captures.

Automated axe/keyboard, Chromium and Playwright WebKit evidence does not establish
real VoiceOver/iOS Safari or NVDA/Firefox coverage. Those production accessibility
checks remain recorded in the release test strategy; the local visual matrix and
the defects above are completed coding/verification work.
