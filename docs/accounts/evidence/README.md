# Synthetic account UI samples

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
