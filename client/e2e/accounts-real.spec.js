// Real account journeys: browser → real account API → isolated Postgres, entered
// through the one-shelf side panel (plan Phase 9 and 8.2). Runs only against
// the loopback harness (tools/accounts/e2e-server.mjs, ACCOUNT_E2E=true); see
// tools/accounts/README.md. The mocked-API versions are in one-shelf-account.spec.js.
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { installPublicV2Fixture } from "./public-v2-fixture.js";

const enabled = process.env.ACCOUNT_E2E === "true";
const GUEST_KEY = "mybookshelf.anonymous-web.v1";
const synthetic = () => ({ email: "pw-" + randomUUID() + "@example.test", password: "a synthetic browser password " + randomUUID() });
const ISBNS = ["9780262033848", "9780131103627", "9780201633610", "9780596007126", "9780132350884"];
const guestBook = (n) => ({ bookKey: "v1:isbn:" + ISBNS[n - 1], isbn13: ISBNS[n - 1], title: "Synthetic guest book " + n, authors: ["Synthetic author"], viewedAt: new Date(Date.UTC(2026, 9, n)).toISOString(), source: "direct" });
const axe = (page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
const sessionStatus = async (page) => (await (await page.request.get("/api/account/session")).json()).status;

async function openPanel(page) {
  await page.getByRole("button", { name: "Account and settings" }).click();
  const panel = page.getByRole("dialog", { name: "Account and settings" });
  await expect(panel).toBeVisible();
  return panel;
}

/** Create account from the side panel, verify through the synthetic outbox, then log in. */
async function signUpAndLogIn(page, request, { email, password }) {
  await page.goto("/app/shelf");
  await (await openPanel(page)).getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const mail = await request.post("/__accounts_test__/mail", { data: { email } });
  expect(mail.ok()).toBeTruthy();
  const { token } = await mail.json();
  let exchanges = 0;
  page.on("request", (req) => { if (req.method() === "POST" && new URL(req.url()).pathname === "/api/account/verify-email") exchanges++; });
  await page.goto("/app/account/verify?token=" + encodeURIComponent(token));
  // A link scanner opening the page spends nothing: one deliberate tap verifies.
  await expect(page.getByRole("button", { name: "Verify email", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/token=/);
  expect(exchanges).toBe(0);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  expect(exchanges).toBe(1);
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await logIn(page, { email, password });
}

async function logIn(page, { email, password }) {
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

test.describe("account browser → real API → isolated Postgres", () => {
  test.skip(!enabled, "Run only against the explicit loopback account harness.");

  test("accounts not answering: no account buttons in the panel, and the browser shelf is kept", async ({ page }) => {
    await page.addInitScript(([key, value]) => localStorage.setItem(key, JSON.stringify(value)),
      [GUEST_KEY, { version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: [guestBook(1)], savedContent: [] }]);
    const unavailable = (route) => route.fulfill({ status: 503, json: { error: { code: "ACCOUNT_DISABLED", message: "Accounts aren’t enabled here yet." } } });
    await page.route("**/api/account/session", unavailable);
    let posts = 0;
    page.on("request", (req) => { if (req.method() === "POST" && new URL(req.url()).pathname.startsWith("/api/account/")) posts++; });
    await page.goto("/app/shelf");
    await expect(page.getByRole("link", { name: "Synthetic guest book 1 by Synthetic author" })).toBeVisible();
    const panel = await openPanel(page);
    await expect(panel.getByRole("link", { name: "Create account" })).toHaveCount(0);
    await expect(panel.getByRole("link", { name: "Log in" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    // An old sign-up link explains and lets the reader carry on.
    await page.goto("/app/account/sign-up");
    await expect(page.getByRole("heading", { name: "Accounts aren’t available right now" })).toBeVisible();
    await page.unroute("**/api/account/session", unavailable);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), GUEST_KEY)).savedBooks.map((b) => b.bookKey)).toEqual([guestBook(1).bookKey]);
    expect(posts).toBe(0);
  });

  for (const light of ["daylight", "lamplight", "ink"])
    test("create account from the side panel, verify, log in, Account settings and Log out in " + light, async ({ page, request }, testInfo) => {
      const reader = synthetic();
      await page.addInitScript((value) => localStorage.setItem("mybookshelf.appearance.v1", JSON.stringify({ version: 1, preference: value })), light);
      let signUps = 0;
      page.on("request", (req) => { if (req.method() === "POST" && new URL(req.url()).pathname === "/api/account/sign-up") signUps++; });
      try {
        await signUpAndLogIn(page, request, reader);
        await expect(page).toHaveURL(/\/app\/shelf$/);
        await expect(page.locator("html")).toHaveAttribute("data-light", light);
        expect(await sessionStatus(page)).toBe("authenticated");
        expect(signUps).toBe(1);
        const panel = await openPanel(page);
        await expect(panel.getByText(reader.email, { exact: true })).toBeVisible();
        expect((await axe(page)).violations).toEqual([]);
        await panel.getByRole("link", { name: "Account settings" }).click();
        await expect(page).toHaveURL(/\/app\/settings\/account$/);
        await expect(page.getByText(reader.email, { exact: true })).toBeVisible();
        expect((await axe(page)).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath("account-settings-" + light + ".png"), fullPage: true });
        // Private values never reach browser storage.
        expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(reader.email);
        await page.getByRole("link", { name: "Back" }).click();
        const again = page.getByRole("dialog", { name: "Account and settings" });
        await expect(again).toBeVisible();
        await again.getByRole("button", { name: "Log out" }).click();
        await expect.poll(() => sessionStatus(page)).toBe("guest");
        await expect(page.getByText(reader.email, { exact: true })).toHaveCount(0);
      } finally {
        await request.post("/__accounts_test__/cleanup", { data: { email: reader.email } });
      }
    });

  test("guest books come over on first log in; a second device sees them and Viewed before; logging out everywhere ends the other device", async ({ browser, request }) => {
    const reader = synthetic();
    const options = { baseURL: process.env.PLAYWRIGHT_BASE_URL, reducedMotion: "reduce" };
    const first = await browser.newContext(options), second = await browser.newContext(options);
    const page = await first.newPage(), other = await second.newPage();
    // Book details and library answers come from the fixture: no live catalog or Open Library requests.
    for (const target of [page, other]) { await installPublicV2Fixture(target); await target.unroute("**/api/account/session"); }
    try {
      // Create and verify the account on the second device, so the first one logs in fresh with guest data.
      await signUpAndLogIn(other, request, reader);
      await expect(other).toHaveURL(/\/app\/shelf$/);
      await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(key, JSON.stringify(value)); sessionStorage.setItem("seeded", "1"); } },
        [GUEST_KEY, { version: 2, selectedLibraryId: null, recentBooks: [guestBook(3)], savedBooks: [guestBook(1), guestBook(2)], savedContent: [] }]);
      await page.goto("/app/shelf");
      await (await openPanel(page)).getByRole("link", { name: "Log in" }).click();
      await logIn(page, reader);
      await expect(page).toHaveURL(/\/app\/account\/import/);
      await expect(page.getByText("2 saved books · 1 recent book")).toBeVisible();
      expect((await axe(page)).violations).toEqual([]);
      await page.getByRole("button", { name: "Bring books over" }).click();
      await expect(page.getByRole("heading", { name: "Books imported" })).toBeVisible();
      await expect(page.getByText(/2 saved books imported\. 1 recent book accepted/)).toBeVisible();
      await page.getByRole("link", { name: "Go to your shelf" }).click();
      await expect(page.getByRole("link", { name: "Synthetic guest book 1 by Synthetic author" })).toBeVisible();

      // Opening a book while signed in adds it to the account's Viewed before automatically.
      await page.getByRole("link", { name: "Synthetic guest book 2 by Synthetic author" }).click();
      await expect(page.getByRole("heading", { name: "Synthetic guest book 2" })).toBeVisible();
      await expect.poll(async () => (await (await page.request.get("/api/account/history")).json()).books.map((b) => b.bookKey)).toContain(guestBook(2).bookKey);

      // The other device refreshes into the same shelf and Viewed before.
      await other.reload();
      await expect(other.getByRole("link", { name: "Synthetic guest book 1 by Synthetic author" })).toBeVisible();
      const viewed = other.getByRole("region", { name: "Viewed before" });
      await expect(viewed.getByRole("link", { name: "Synthetic guest book 2 by Synthetic author" })).toBeVisible();
      await expect(viewed.getByRole("link", { name: "Synthetic guest book 3 by Synthetic author" })).toBeVisible();

      // Signing the other device out from the first (Account settings → More) ends its private state.
      await page.goto("/app/settings/account/more");
      await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Password", { exact: true }).fill(reader.password);
      await dialog.getByRole("button", { name: "Continue", exact: true }).click();
      await dialog.getByRole("button", { name: "Sign out this device", exact: true }).click();
      await expect(page.getByText("Signed out that device.", { exact: true })).toBeVisible();
      await other.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => sessionStatus(other)).toBe("guest");
      await other.goto("/app/shelf");
      await expect(other.getByRole("link", { name: "Synthetic guest book 1 by Synthetic author" })).toHaveCount(0);
    } finally {
      await request.post("/__accounts_test__/cleanup", { data: { email: reader.email } });
      await first.close(); await second.close();
    }
  });

  test("Account settings: export downloads JSON with the shelf and no secrets; deleting asks once, then the account is gone", async ({ page, request }, testInfo) => {
    const reader = synthetic();
    try {
      await signUpAndLogIn(page, request, reader);
      await expect(page).toHaveURL(/\/app\/shelf$/);
      const save = await page.request.put("/api/account/books", {
        headers: { "X-Account-CSRF": (await (await page.request.get("/api/account/session")).json()).csrfToken, Origin: new URL(page.url()).origin },
        data: { book: { bookKey: guestBook(4).bookKey, isbn13: guestBook(4).isbn13, title: guestBook(4).title, authors: guestBook(4).authors },
          shelfRevision: (await (await page.request.get("/api/account/state")).json()).shelfRevision, operationId: randomUUID() },
      });
      expect(save.ok()).toBeTruthy();
      await page.goto("/app/settings/account/more");
      await page.getByRole("button", { name: "Download account data", exact: true }).click();
      const confirm = page.getByRole("dialog");
      await confirm.getByLabel("Password", { exact: true }).fill(reader.password);
      await confirm.getByRole("button", { name: "Continue", exact: true }).click();
      const downloaded = page.waitForEvent("download");
      await confirm.getByRole("button", { name: "Download account data", exact: true }).click();
      const download = await downloaded;
      expect(download.suggestedFilename()).toBe("mybookshelf-account.json");
      const text = await readFile(await download.path(), "utf8");
      const data = JSON.parse(text);
      expect(data.schemaVersion).toBe(1);
      expect(data.profile.email).toBe(reader.email);
      expect(data.savedBooks.map((b) => b.bookKey)).toEqual([guestBook(4).bookKey]);
      for (const forbidden of ["authUserId", "sessionId", "accessToken", "csrfToken", "passwordHash"]) expect(text).not.toContain(forbidden);
      await testInfo.attach("export-keys", { body: Object.keys(data).join(","), contentType: "text/plain" });
      await page.goto("/app/settings/account");
      await page.getByRole("button", { name: "Delete account" }).click();
      const dialog = page.getByRole("alertdialog", { name: "Delete account and shelf?" });
      await expect(dialog.getByLabel("Password")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      expect(await sessionStatus(page)).toBe("authenticated");
      await page.getByRole("button", { name: "Delete account" }).click();
      await dialog.getByLabel("Password").fill(reader.password);
      await dialog.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByRole("heading", { name: "Account deleted" })).toBeVisible();
      await expect.poll(() => sessionStatus(page)).toBe("guest");
      await page.getByRole("link", { name: "Back to my shelf" }).click();
      await expect(page.getByRole("link", { name: guestBook(4).title + " by Synthetic author" })).toHaveCount(0);
      // The deleted account can no longer log in.
      await page.goto("/app/account/sign-in");
      await logIn(page, reader);
      await expect(page.getByRole("alert")).toBeVisible();
      expect(await sessionStatus(page)).toBe("guest");
    } finally {
      await request.post("/__accounts_test__/cleanup", { data: { email: reader.email } });
    }
  });
});

// Ported from the pre-one-shelf spec: the email change lives under Account settings → More.
test("email change requires fresh confirmation, supports cancellation and updates only after the new address is verified", async ({
  page,
  request,
}) => {
  test.skip(
    !enabled,
    "Run only against the explicit loopback account harness.",
  );
  const base = process.env.PLAYWRIGHT_BASE_URL,
    email = "pw-" + randomUUID() + "@example.test",
    newEmail = "pw-" + randomUUID() + "@example.test",
    password = "a synthetic email-change password " + randomUUID();
  try {
    expect(
      (
        await request.post("/api/account/sign-up", {
          headers: { Origin: base },
          data: { name: "Synthetic email reader", email, password },
        })
      ).status(),
    ).toBe(202);
    const token = (
      await (
        await request.post("/__accounts_test__/mail", { data: { email } })
      ).json()
    ).token;
    expect(
      (
        await request.post("/api/account/verify-email", {
          headers: { Origin: base },
          data: { token },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto("/app/account/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    const requestChange = async () => {
      await page
        .getByRole("button", { name: "Change email", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Password", { exact: true }).fill(password);
      await dialog
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await dialog.getByLabel("New email", { exact: true }).fill(newEmail);
      await dialog
        .getByRole("button", { name: "Change email", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Cancel email change", exact: true }),
      ).toBeVisible();
    };
    await page.goto("/app/settings/account/more");
    await requestChange();
    let oldSession = await (
      await page.request.get("/api/account/session")
    ).json();
    expect(oldSession.user.email).toBe(email);
    const cancelled = (
      await (
        await request.post("/__accounts_test__/mail", {
          data: { email, kind: "newEmail" },
        })
      ).json()
    ).token;
    await page
      .getByRole("button", { name: "Cancel email change", exact: true })
      .click();
    await expect(
      page.getByText(
        "Email change cancelled. Your current address is unchanged.",
        { exact: true },
      ),
    ).toBeVisible();
    await requestChange();
    const fresh = (
      await (
        await request.post("/__accounts_test__/mail", {
          data: { email, kind: "newEmail" },
        })
      ).json()
    ).token;
    expect(fresh).not.toBe(cancelled);
    await page.goto(
      "/app/account/email-change?token=" + encodeURIComponent(cancelled),
    );
    await page
      .getByRole("button", { name: "Confirm new email", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      /expired or was already used/,
    );
    await page.goto(
      "/app/account/email-change?token=" + encodeURIComponent(fresh),
    );
    await expect(page).not.toHaveURL(/token=/);
    await page
      .getByRole("button", { name: "Confirm new email", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Email updated" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Go to your account" }).click();
    await expect(
      page.getByText(newEmail, { exact: true }).last(),
    ).toBeVisible();
    oldSession = await (await page.request.get("/api/account/session")).json();
    expect(oldSession.user.email).toBe(newEmail);
    await expect(
      page.getByRole("button", { name: "Cancel email change" }),
    ).toHaveCount(0);
  } finally {
    await request.post("/__accounts_test__/cleanup", { data: { email } });
    await request.post("/__accounts_test__/cleanup", {
      data: { email: newEmail },
    });
  }
});

test("switching accounts rejects an older view and never renders the previous private shelf", async ({
  page,
  request,
}) => {
  test.skip(
    !enabled,
    "Run only against the explicit loopback account harness.",
  );
  const base = process.env.PLAYWRIGHT_BASE_URL,
    emails = [
      "pw-" + randomUUID() + "@example.test",
      "pw-" + randomUUID() + "@example.test",
    ],
    password = "a synthetic account-switch password " + randomUUID();
  try {
    for (let i = 0; i < emails.length; i++) {
      expect(
        (
          await request.post("/api/account/sign-up", {
            headers: { Origin: base },
            data: {
              name: "Synthetic account " + i,
              email: emails[i],
              password,
            },
          })
        ).status(),
      ).toBe(202);
      const token = (
        await (
          await request.post("/__accounts_test__/mail", {
            data: { email: emails[i] },
          })
        ).json()
      ).token;
      expect(
        (
          await request.post("/api/account/verify-email", {
            headers: { Origin: base },
            data: { token },
          })
        ).ok(),
      ).toBeTruthy();
    }
    const login = async (email) => {
      await page.goto("/app/account/sign-in");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/shelf$/);
    };
    await login(emails[0]);
    const a = await (await page.request.get("/api/account/session")).json(),
      oldCookie = (await page.context().cookies())
        .map((c) => c.name + "=" + c.value)
        .join("; ");
    const book = {
      bookKey: "v1:googlebooks:" + randomUUID().replaceAll("-", ""),
      title: "Only account A can see this synthetic shelf",
      authors: [],
    };
    expect(
      (
        await page.request.put("/api/account/books", {
          headers: {
            Origin: base,
            "X-Account-CSRF": a.csrfToken,
            "X-Account-Identity": a.user.id,
          },
          data: { book, shelfRevision: 0, operationId: randomUUID() },
        })
      ).ok(),
    ).toBeTruthy();
    await page.reload();
    await expect(
      page
        .getByRole("link", { name: new RegExp("^" + book.title) }),
    ).toBeVisible();
    await login(emails[1]);
    await expect(page.getByText(book.title, { exact: true })).toHaveCount(0);
    const b = await (await page.request.get("/api/account/session")).json();
    expect(b.user.email).toBe(emails[1]);
    const wrong = await page.request.get("/api/account/books", {
      headers: { "X-Account-Identity": a.user.id },
    });
    expect(wrong.status()).toBe(409);
    expect((await wrong.json()).error.code).toBe("IDENTITY_CHANGED");
    const old = await request.get("/api/account/session", {
      headers: { Cookie: oldCookie },
    });
    expect((await old.json()).status).toBe("guest");
    expect(
      (await (await page.request.get("/api/account/session")).json()).user.id,
    ).toBe(b.user.id);
  } finally {
    for (const email of emails)
      await request.post("/__accounts_test__/cleanup", { data: { email } });
  }
});

