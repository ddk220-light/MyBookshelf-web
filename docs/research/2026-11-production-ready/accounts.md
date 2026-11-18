# Account flows on production, both phones

18 November 2026, `https://mybookshelf.cloud`, one test account made with
plus-addresses of the owner's Gmail and deleted at the end. iPhone 16 Pro Max
(Safari) and Pixel 6 Pro (Chrome, regular tab), driven from the owner's Mac.
Part of backlog item 24. Nothing in the app was changed.

Passwords were never typed by the session: the phones' password managers
generated and filled them (Bitwarden on the iPhone, later 1Password on the
Pixel), with the owner pasting or unlocking where the phone required it.
Deliberately wrong passwords were typed as junk strings. Screenshots (about 90)
are on the Mac in `~/mybookshelf-phones/run-2026-11-18/accounts/`
(`i..` iPhone, `p..` Pixel), outside the repository.

## What was run, and the result

| Step | Device | Result | Time |
|---|---|---|---|
| Create account | iPhone | First try rejected: a 14-character password-manager suggestion is "Too short: 15 characters or more". Second try accepted | about 10 s from submit to "Check your email" |
| Verification email | Gmail | Arrived | within about 15 s |
| Open link, "Verify email" | iPhone | "Email verified", then a Log in button (not signed in) | about 2 s |
| Log in | iPhone | Signed in | 1.6 s |
| Bring books over | iPhone | 1 saved book, 1 recent book and the browser's library imported; browser copy unchanged | 1.6 s |
| Save a book signed in | iPhone | Shelf shows 2 books | under 2 s |
| Wrong or empty password | Pixel | "Wrong email or password", field emptied | about 1 s |
| Log in to the same account | Pixel | Signed in; shelf shows the 2 books and the library | sign-in call 2.2 s, shelf at 2.9 s, `account/books` 3.4 s |
| Save a book, change library | Pixel | Saved; library changed | under 2 s each |
| Same account on the iPhone | iPhone | Showed the new book and library when Safari came to the front, no reload | about 5 s |
| Remove a book | iPhone | Removed, with Undo | under 2 s |
| Same account on the Pixel | Pixel | Still 3 books 5 s after returning to Chrome; 2 books on the next return, over a minute later | — |
| Libraries near me, location allowed | iPhone | 12 libraries, nearest first, with distances | 2.0 s |
| Log out | iPhone | Immediate, no question; the browser's own guest shelf came back | under 2 s |
| Wrong passwords, repeated | iPhone | Three clean attempts: "Wrong email or password". Later attempts were spoiled by the session's own typing (see below) | — |
| Change email | iPhone | "Confirm it's you" (password) seconds after logging in; then both emails arrived; link confirmed: "Email updated" | emails within 1 s |
| Other device after email change | Pixel | Signed out, with a notice: Sign in / Continue as guest | on next return to Chrome |
| Forgot password | Pixel | "Link sent"; email arrived | within 1 s |
| Reset page after the browser restarted | Pixel | "Link expired · Send a new link", although the link was 4 minutes old and still worked when reopened | — |
| "Send a new link" | Pixel | Opens the empty Reset password form; sends nothing | — |
| Save new password | Pixel | "Password saved", then a Log in button (not signed in); "password was changed" email sent | 0.55 s |
| Other device after reset | iPhone | Signed out, with the notice; guest shelf back | — |
| Log in, new email and password | Pixel | Signed in; shelf and library intact | sign-in call 0.35 s |
| Delete account | Pixel | Password dialog, then "Account deleted" | about 1 s |
| Shelf after deletion | Pixel | Guest shelf, empty | — |
| Log in to the deleted account | Pixel | "This account is unavailable" (HTTP 403) | 0.14 s |

Emails received, all from `accounts@mybookshelf.cloud`: verify, email change
requested (old address), confirm new email (new address), email was changed
(old address), reset password, password was changed. No email about the
deletion had arrived when the run ended.

## Findings

### Broken

1. **A password manager's suggestion is rejected.** Safari's "Fill Strong
   Password" (Bitwarden, 14 characters) gives "Too short: 15 characters or
   more". After the rejection the suggested password stands in the field in
   plain text. Item 16. `i08-too-short-message-cropped`.
2. **Reloading the reset page says "Link expired".** The page removes the
   token from the address, so a reload, a restored tab or a restarted browser
   loses it and shows "Link expired" for a link that is still valid.
   "Send a new link" then opens an empty form and sends nothing. New
   (item 33). `p19-after-chrome-restart`, `p20-send-a-new-link`,
   `p21-old-link-reopened`.
3. **"Bring books over" moves under the finger.** A "Loading your account
   shelf…" bar appears above the form and disappears a moment later, moving
   the checkboxes and both buttons about 120 px. The session's own taps landed
   on the wrong control ("Remove the copy here", then "Keep them here for
   now"). Item 17. `i16-after-log-in`, `i18-bring-books-library-ticked`.
4. **Dialog buttons hidden by the keyboard.** In "Change email" on the iPhone
   the keyboard and Safari's autofill bar cover both buttons; only the
   keyboard's Return submits. Item 19. `i52-change-email-submitted` (first
   capture), `i51-new-email-typed`.
5. **Creating the account is slow.** About 10 s from submit to "Check your
   email", with no progress shown. (Signing in takes 0.4 to 2.2 s.) Item 16:
   find where the time goes; the leaked-password check is a candidate, not
   measured.

### Confusing

6. **Verifying and resetting both end at "Log in".** After "Email verified"
   and after "Password saved" the reader must sign in again, and the email
   field is empty. Item 16.
7. **"Confirm it's you" seconds after logging in.** Changing the email asks
   for the password immediately after a fresh sign-in. Deleting asks for it
   too. Item 16/19.
8. **Delete account says almost nothing.** The dialog is "Delete account and
   shelf?", a password field and Delete. What is deleted, when, and what stays
   in this browser is only on the longer "Your account" page. The result page
   is "Account deleted · Back to my shelf". No email confirms it. Item 19.
   `p30-delete-account-step1`, `p33-after-delete`.
9. **A deleted account answers "This account is unavailable"** (403), while a
   wrong password answers "Wrong email or password". The first tells anyone
   that an account existed for that address. Owner's decision.
10. **Two account screens in two styles.** "Account settings" (email, Change
    password, Delete account, More) and, behind "More", "Your account" with
    cards, underlined links and its own Delete account button. Item 19.
    `i22-account-settings`, `i24-account-settings-more`, `i25`, `i26`.
11. **Status bars that stay or follow.** "Saved" stays at the top of the
    signed-in shelf on both phones after an import or a change. The
    "You've been signed out" notice stays on top of the Forgot password page.
    Item 19. `i31`, `p12`, `p15-forgot-password-form`.
12. **Changes reach the other device late.** The signed-in shelf refreshes on
    focus at most once a minute, so a removal was missing on the first return
    to the other phone and present on the second. Nothing shows that the shelf
    may be behind. Item 17.
13. **The "found" mark does not travel.** A book marked found on one phone had
    no mark on the other until opened there. Same cause as research finding 1
    (item 20).
14. **Signed-in devices lists a session that was logged out.** After Log out
    and a new log-in on the iPhone the list showed two "Safari on mobile"
    entries. `i49-change-email-form`.
15. **Reset and account screens lack context.** The New password page shows
    neither the account's email nor the password rule; Create account shows no
    rule until it fails; the side panel cuts the email
    ("deepakdhanavel+mbtest111…"). Item 16/19.
16. **Password managers and the forms.** On the iPhone, Safari's email
    suggestion covers the Password label and field; with a third-party
    keyboard no saved-login suggestion shows on the email field. After an
    email change the saved login keeps the old address, so the manager fills
    the wrong email. Item 16.
17. **Emails thread together across accounts.** Reset and "password was
    changed" emails have fixed subjects, so Gmail put the test account's
    messages in the same thread as the owner's earlier ones. Minor.

### Worked well

- Sign-in, import, saving, library change and removal are quick (0.4 to 2 s).
- Sync across the two phones works in both directions without a reload.
- Log out returns the browser to its own guest shelf, and that shelf was not
  touched by the account (open question 4 answered by today's behaviour).
- Email and password changes sign the other device out and say so clearly.
- Security emails arrive within a second or two and go to the right address
  (old address for the email-change notices).
- "Libraries near me" is fast and clear.
- Deletion is immediate and the session ends on every device.

## What went wrong in the run itself

- The first tap on "Bring books over" hit the wrong controls because of
  finding 3; the import was redone through "Review import".
- While typing junk passwords on the iPhone, iOS opened 1Password's unlock
  sheet twice. Some junk text very likely went into its password field; it was
  not submitted as far as could be seen, and the sheet was cancelled. Junk
  text also went into the app's email field, so only three of six wrong-password
  attempts count, and the "Couldn't connect · Try again" message seen then is
  unexplained (malformed email or attempt limit).
- One screenshot showed the rejected suggested password; it was deleted and
  only a crop of the message kept.
- A Back key press on the Pixel left the reset page once; the link was
  reopened.

## Not covered

Change password from settings (current and new password in one form), Sign out
all devices, Download account data, Clear saved books, changing the name,
"Remove the copy here" on import, the attempt limit, account flows on desktop,
and whether production's databases recorded each step (item 20).
