# Production-ready screens (November 2026)

Mock-ups for the production-ready work. They show what changes on screen; the
reasons and the code changes are in
[the design and implementation plan](../../plans/2026-11-production-ready-design.md).
These boards replace the matching boards in
[2026-11-one-shelf](../2026-11-one-shelf/README.md) where the two differ.

`canvas.json` lists the boards in order. Each `.dc.html` file is one screen
(open the folder as a design canvas; the files use the canvas's own runtime
and do not render fully when opened alone in a browser).

The shelf is called "My reading shelf" everywhere. The boards use placeholder
covers and example books. Sizes: phone 390 x 844,
desktop 1440 x 900. Colours, type and spacing are the app's own.

## 1. The library answer, in words

| Board | What it shows | Replaces |
|---|---|---|
| `Main` | Shelf, headed "My reading shelf": library row with logo tile, name linking to the catalog, and Change; settings gear in place of the person icon; an answer in words under every saved book | `Shelf` |
| `BookFound` | "In your library", library name, "See this book in the library's catalog", Change library. No "checked" date | `BookChecked` |
| `BookNotFound` | "Not in your library", a plain explanation, "Search the library's catalog yourself"; "On my shelf" as a status with a separate "Remove from my shelf" | `BookStates` |
| `BookChecking` | "Checking your library…" with a moving bar, how long it can take, and that the reader may leave | `BookStates` |
| `BookCouldntCheck` | "Couldn't check right now", that this does not mean the book is missing, "Try again" and "Open catalog" as text buttons | `BookStates` |
| `Results` | Title, author and year under every cover; the answer in words on books that have one; no summary banner | `Results` |
| `NoResults` | "No books found" with three things to try, the scanner, and a way to tell us | `SearchStates` |

## 2. Choosing a library

| Board | What it shows | Replaces |
|---|---|---|
| `FirstVisit` | A new reader is asked to choose a library on the shelf itself, and can decline | `SuggestFirstOpen` |
| `PickerTyping` | With the keyboard open: title and Close stay, the field is at the top, results sit between the field and the keyboard | `LibraryPicker` |
| `PickerResults` | The current library with Remove; a count ("Showing 25 of 61"); "Show 25 more"; the footer stays in view | `LibraryStates` |
| `RequestLibrary` | "My library isn't listed" opens a form: library name and city, optional name and email, Send request, Cancel. Nothing is sent before Send | (new) |

## 3. Settings and account

| Board | What it shows | Replaces |
|---|---|---|
| `Settings` | One panel from the gear: My library, Account, Reading light, Help and about, each with a line of explanation | `AccountPanel` |
| `CreateAccount` | A welcome, what an account adds, email, a password with an eye icon to show or hide it and no rules, what happens next | `AccountStates` |
| `LogIn` | "Email me a log-in link" first; the password as the second way | `AccountStates` |
| `Welcome` | After the email link: signed in, with what was merged from this device | (new) |
| `Account` | One "Your account" screen: email, password, the size of the shelf, Log out, delete. No download and no device list | `AccountSettings`, `AccountSignedIn` |
| `DeleteAccount` | What is deleted (including the copy kept in this browser), what stays for a short time, password, "Delete my account" and "Keep my account" | (new) |
| `ReportProblem` | A prompt, what is sent with the message, optional name and email kept 90 days | `ReportProblem` |

## 4. Desktop

| Board | What it shows | Replaces |
|---|---|---|
| `DeskShelf` | Left column with the library link, "Change library", account, a Settings entry and Help; answers in words under the covers | `DeskShelf` |

## Not drawn

Change email and Change password (the form style of `DeleteAccount`), the rail
layout between 640 and 1099 px (a gear replaces the three icons), the public
About page and the privacy policy (text, not layout).
