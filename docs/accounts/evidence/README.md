# Synthetic account UI samples

The latest [paired gallery](ui-review/index.html) and
[screen review](../SCREEN_REVIEW.md) cover implementation `56915a6`. Default phone
captures use a 390 CSS-pixel viewport at 100% text, with 28px headings and 16px
body/inputs. Enlarged-text cases are labelled separately. Actual successful account
operations use the disposable real API/Postgres; all displayed readers are synthetic.

| Latest normal phone screen | App | Approved artifact |
| --- | --- | --- |
| Create account, Daylight | [App](ui-review/sign-up-daylight-390-app.png) | [Artifact](ui-review/sign-up-daylight-390-artifact.png) |
| Create account, Lamplight | [App](ui-review/sign-up-lamplight-390-app.png) | [Artifact](ui-review/sign-up-lamplight-390-artifact.png) |
| Create account, Ink | [App](ui-review/sign-up-ink-390-app.png) | [Artifact](ui-review/sign-up-ink-390-artifact.png) |
| Account settings | [App](ui-review/settings-daylight-390-app.png) | [Artifact](ui-review/settings-daylight-390-artifact.png) |
| Bottom data controls | [App](ui-review/settings-lamplight-390-bottom-app.png) | [Artifact](ui-review/settings-lamplight-390-bottom-artifact.png) |

The gallery includes desktop, field/error recovery and sensitive dialogs. Matrix
metadata: [Chromium](ui-review/matrix-chromium.json),
[mobile Chromium](ui-review/matrix-mobile-chromium.json),
[WebKit](ui-review/matrix-webkit.json). Each records 85 paired entries; twelve
additional bottom settings pairs and separate stress images extend each run.
Native pixel dimensions on high-DPR profiles do not change the CSS font size.
The curated gallery uses DPR 1 images, contains no browser state/credentials and
is not evidence of real external mail/provider success or manual screen-reader checks.

## Earlier implementation checkpoint

The samples below predate the layout/type/retry fixes above and remain dated
historical evidence.

Captured 2026-11-01 against code `61e461c501d9f256e96996cc8d169e2bdb1bd807`,
real loopback API/Postgres, from `accounts-real.spec.js`. Every displayed identity
is synthetic (`example.test`); no mail link, token, deletion nonce or real data
is included. Screens show the current viewport of the app's scroll container.
They do not claim complete route/state coverage or a measured pixel-match score.

| Light | Desktop Chromium | Mobile Chromium |
| --- | --- | --- |
| Daylight | [Settings](settings-daylight-desktop.png) | [Settings](settings-daylight-mobile.png) |
| Lamplight | [Settings](settings-lamplight-desktop.png) | [Settings](settings-lamplight-mobile.png) |
| Ink | [Settings](settings-ink-desktop.png) | [Settings](settings-ink-mobile.png) |

[WebKit deletion confirmation](delete-webkit.png) shows the separate final consent
step after recent authentication. Automated keyboard checks verify Escape restores
the initiating control and Tab does not reach background app controls; real
screen-reader and mobile Safari evidence remains required.

Typography, reading-light tokens, private account sections and native dialog
patterns follow the R02-approved Claude canvas v4. The running app uses current
server capabilities, so unconfigured Google/Apple buttons are absent. These samples
are password-account states; the provider-return screens and actual hosted mail
cannot be accepted from them. See [validation](../VALIDATION.md) for scope/limits.
