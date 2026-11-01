import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
const enabled = process.env.ACCOUNT_E2E === "true";
test("unavailable signup preserves browser books and recovers when the service returns", async ({
  page,
}, testInfo) => {
  test.skip(
    !enabled,
    "Run only against the explicit loopback account harness.",
  );
  const fixture = {
    version: 1,
    selectedLibraryId: null,
    recentBooks: [],
    savedBooks: [
      {
        bookKey: "v1:isbn:9780262033848",
        isbn13: "9780262033848",
        title: "Synthetic preserved guest book",
        authors: ["Synthetic author"],
        viewedAt: new Date().toISOString(),
        source: "direct",
      },
    ],
  };
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "mybookshelf.anonymous-web.v1",
        JSON.stringify(value),
      ),
    fixture,
  );
  const unavailable = (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "ACCOUNT_DISABLED",
          message: "Accounts aren’t enabled here yet.",
        },
      },
    });
  await page.route("**/api/account/session", unavailable);
  let posts = 0;
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      new URL(req.url()).pathname.startsWith("/api/account/")
    )
      posts++;
  });
  await page.goto("/app/account/sign-up");
  await expect(
    page.getByRole("heading", { name: "Accounts aren’t available right now" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("account-unavailable.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Continue using this browser", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Saved books" })
      .getByRole("link", { name: "Synthetic preserved guest book" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Create account", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("region", { name: "Keep your shelf across devices" })
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Accounts aren’t available right now" }),
  ).toBeVisible();
  await page.unroute("**/api/account/session", unavailable);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  expect(
    (
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("mybookshelf.anonymous-web.v1")),
      )
    ).savedBooks,
  ).toEqual(fixture.savedBooks);
  expect(posts).toBe(0);
});
test("native signup navigation, validation, duplicate submit and verification lead to a working session", async ({
  page,
  request,
}) => {
  test.skip(
    !enabled,
    "Run only against the explicit loopback account harness.",
  );
  const email = "pw-" + randomUUID() + "@example.test";
  const password = "Synthetic signup workflow password " + randomUUID();
  let submissions = 0;
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      new URL(req.url()).pathname === "/api/account/sign-up"
    )
      submissions++;
  });
  try {
    await page.goto("/app/settings");
    await page
      .getByRole("link", { name: "Create account", exact: true })
      .click();
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Synthetic workflow reader");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("too short");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.locator("#account-password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(submissions).toBe(0);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .dblclick();
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    expect(submissions).toBe(1);
    await page.getByRole("link", { name: "Sign in after verifying" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Send verification link" }),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/account/session")).json()).status,
    ).toBe("guest");
    const mail = await request.post("/__accounts_test__/mail", {
      data: { email },
    });
    expect(mail.ok()).toBeTruthy();
    const { token } = await mail.json();
    await page.goto("/app/account/verify?token=" + encodeURIComponent(token));
    await page
      .getByRole("button", { name: "Verify email", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Email verified" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Sign in", exact: true })
      .first()
      .click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    expect(
      (await (await page.request.get("/api/account/session")).json()).status,
    ).toBe("authenticated");
    expect(submissions).toBe(1);
  } finally {
    await request.post("/__accounts_test__/cleanup", { data: { email } });
  }
});
test.describe("account browser → real API → isolated Postgres", () => {
  test.skip(
    !enabled,
    "Run only against the explicit loopback account harness.",
  );
  for (const light of ["daylight", "lamplight", "ink"])
    test(
      "signup, scanner-safe verification, profile and sign-out in " + light,
      async ({ page, request }, testInfo) => {
        const email = "pw-" + randomUUID() + "@example.test",
          password = "a synthetic browser password " + randomUUID();
        await page.addInitScript(
          (light) =>
            localStorage.setItem(
              "mybookshelf.appearance.v1",
              JSON.stringify({ version: 1, preference: light }),
            ),
          light,
        );
        try {
          await page.goto("/app/account/sign-up");
          await expect(
            page.getByRole("heading", { name: "Create account" }),
          ).toBeVisible();
          await expect(page.locator("html")).toHaveAttribute(
            "data-light",
            light,
          );
          await page.screenshot({
            path: testInfo.outputPath("account-sign-up-" + light + ".png"),
            fullPage: true,
          });
          await page
            .getByLabel("Your name", { exact: true })
            .fill("Synthetic private reader");
          await page.getByLabel("Email", { exact: true }).fill(email);
          await page.getByLabel("Password", { exact: true }).fill(password);
          await page
            .getByRole("button", { name: "Create account", exact: true })
            .click();
          await expect(
            page.getByRole("heading", { name: "Check your email" }),
          ).toBeVisible();
          const mail = await request.post("/__accounts_test__/mail", {
            data: { email },
          });
          expect(mail.ok()).toBeTruthy();
          const { token } = await mail.json();
          let exchanges = 0;
          page.on("request", (req) => {
            if (
              req.method() === "POST" &&
              new URL(req.url()).pathname === "/api/account/verify-email"
            )
              exchanges++;
          });
          await page.goto(
            "/app/account/verify?token=" + encodeURIComponent(token),
          );
          await expect(
            page.getByRole("button", { name: "Verify email", exact: true }),
          ).toBeVisible();
          await expect(page).not.toHaveURL(/token=/);
          expect(exchanges).toBe(0);
          await page
            .getByRole("button", { name: "Verify email", exact: true })
            .click();
          await expect(
            page.getByRole("heading", { name: "Email verified" }),
          ).toBeVisible();
          expect(exchanges).toBe(1);
          await page
            .getByRole("link", { name: "Sign in", exact: true })
            .first()
            .click();
          await page.getByLabel("Email", { exact: true }).fill(email);
          await page.getByLabel("Password", { exact: true }).fill(password);
          await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
          await expect(page).toHaveURL(/\/app\/shelf$/);
          await page.goto("/app/settings/account");
          await expect(
            page.getByLabel("Your name", { exact: true }),
          ).toHaveValue("Synthetic private reader");
          await page
            .getByLabel("Your name", { exact: true })
            .fill("Edited private reader");
          await page
            .getByRole("button", { name: "Save name", exact: true })
            .click();
          await expect(
            page.getByText("Name saved", { exact: true }),
          ).toBeVisible();
          await expect(page.getByRole("switch")).toHaveAttribute(
            "aria-checked",
            "false",
          );
          const a11y = await new AxeBuilder({ page })
            .include(".app-screen")
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(a11y.violations).toEqual([]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath("account-settings-" + light + ".png"),
            fullPage: true,
          });
          const storage = await page.evaluate(() =>
            JSON.stringify({ ...localStorage }),
          );
          expect(storage).not.toContain(email);
          expect(storage).not.toContain("Edited private reader");
          await page
            .getByRole("button", { name: "Sign out here", exact: true })
            .click();
          await expect(page).toHaveURL(/\/app\/shelf$/);
          await expect(page.getByText(email, { exact: true })).toHaveCount(0);
          // Private UI clears before the server acknowledges sign-out.
          await expect
            .poll(
              async () =>
                (await (await page.request.get("/api/account/session")).json())
                  .status,
            )
            .toBe("guest");
        } finally {
          await request.post("/__accounts_test__/cleanup", { data: { email } });
        }
      },
    );
});

test("explicit import, cross-device refresh and remote revocation clear private state", async ({
  page,
  browser,
  request,
}) => {
  test.skip(
    !enabled,
    "Run only against the explicit loopback account harness.",
  );
  const base = process.env.PLAYWRIGHT_BASE_URL,
    email = "pw-" + randomUUID() + "@example.test",
    password = "a synthetic multi-device password " + randomUUID();
  const book = {
    bookKey: "v1:isbn:9780262033848",
    isbn13: "9780262033848",
    title: "Synthetic private shelf book",
    authors: ["Synthetic author"],
  };
  const recent = {
    bookKey: "v1:isbn:9781625275868",
    title: "Synthetic imported recent book",
    authors: [],
    source: "direct",
    viewedAt: new Date(Date.now() - 86400000).toISOString(),
  };
  const snapshot = {
    version: 1,
    selectedLibraryId: "bc:smcl",
    savedBooks: [{ ...book, source: "direct", viewedAt: recent.viewedAt }],
    recentBooks: [recent],
  };
  let second;
  try {
    expect(
      (
        await request.post("/api/account/sign-up", {
          headers: { Origin: base },
          data: { name: "Synthetic multi-device reader", email, password },
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
    await page.addInitScript((snapshot) => {
      if (!localStorage.getItem("mybookshelf.anonymous-web.v1"))
        localStorage.setItem(
          "mybookshelf.anonymous-web.v1",
          JSON.stringify(snapshot),
        );
    }, snapshot);
    await page.route("**/api/v2/books/resolve", (route) =>
      route.fulfill({ json: { book } }),
    );
    await page.route("**/api/v2/availability", (route) =>
      route.fulfill({
        json: {
          outcome: "unknown",
          matchKind: null,
          lookupKind: "exact_isbn",
          freshness: "none",
          attemptedAt: new Date().toISOString(),
        },
      }),
    );
    await page.goto("/app/account/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Bring books over" }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Include recently viewed/ }),
    ).not.toBeChecked();
    await page
      .getByRole("checkbox", { name: /Include recently viewed/ })
      .check();
    await page
      .getByRole("checkbox", { name: /Use this browser’s library/ })
      .check();
    await page.getByRole("checkbox", { name: /Remove the copy here/ }).check();
    await page
      .getByRole("button", { name: "Bring books over", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Books imported" }),
    ).toBeVisible();
    const local = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mybookshelf.anonymous-web.v1")),
    );
    expect(local.savedBooks).toEqual([]);
    expect(local.recentBooks).toEqual([]);
    expect(local.selectedLibraryId).toBeNull();
    await page.getByRole("link", { name: "Go to your shelf" }).click();
    await expect(
      page
        .getByRole("region", { name: "Saved books" })
        .getByRole("link", { name: book.title }),
    ).toBeVisible();
    await page.goto("/app/books/" + encodeURIComponent(book.bookKey));
    await expect(page.getByRole("heading", { name: book.title })).toBeVisible();
    let history = await (await page.request.get("/api/account/history")).json();
    expect(history.historyEnabled).toBe(false);
    expect(history.books.map((b) => b.bookKey)).toEqual([recent.bookKey]);
    second = await browser.newContext({ baseURL: base });
    const other = await second.newPage();
    await other.goto("/app/account/sign-in");
    await other.getByLabel("Email", { exact: true }).fill(email);
    await other.getByLabel("Password", { exact: true }).fill(password);
    await other.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      other
        .getByRole("region", { name: "Saved books" })
        .getByRole("link", { name: book.title }),
    ).toBeVisible();
    await page.getByRole("button", { name: "On your shelf" }).click();
    await expect(
      page.getByRole("button", { name: "Save book", exact: true }),
    ).toBeVisible();
    await other.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      other
        .getByRole("region", { name: "Saved books" })
        .getByRole("link", { name: book.title }),
    ).toHaveCount(0);
    await page.goto("/app/settings/account");
    await page.getByRole("switch").click();
    await expect(page.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.goto("/app/books/" + encodeURIComponent(book.bookKey));
    await expect
      .poll(async () => {
        const h = await (await page.request.get("/api/account/history")).json();
        return h.books.some((b) => b.bookKey === book.bookKey);
      })
      .toBe(true);
    await page.goto("/app/settings/account");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Sign out this device", exact: true })
      .click();
    await expect(
      page.getByText("Signed out that device.", { exact: true }),
    ).toBeVisible();
    await other.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(other.getByText(/You’ve been signed out/)).toBeVisible();
    await expect(
      other.getByText("Synthetic multi-device reader", { exact: true }),
    ).toHaveCount(0);
    expect(
      (await (await other.request.get("/api/account/session")).json()).status,
    ).toBe("guest");
  } finally {
    await second?.close();
    await request.post("/__accounts_test__/cleanup", { data: { email } });
  }
});

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
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
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
    await page.goto("/app/settings/account");
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
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
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
        .getByRole("region", { name: "Saved books" })
        .getByRole("link", { name: book.title }),
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

test("private export downloads JSON; deletion can be cancelled, confirmed once and checked after a lost response", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    !enabled,
    "Run only against the explicit loopback account harness.",
  );
  const base = process.env.PLAYWRIGHT_BASE_URL,
    email = "pw-" + randomUUID() + "@example.test",
    password = "a synthetic data-controls password " + randomUUID();
  try {
    expect(
      (
        await request.post("/api/account/sign-up", {
          headers: { Origin: base },
          data: { name: "Synthetic export reader", email, password },
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
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await page.goto("/app/settings/account");
    await page.evaluate(() =>
      localStorage.setItem(
        "mybookshelf.anonymous-web.v1",
        JSON.stringify({
          version: 1,
          selectedLibraryId: null,
          recentBooks: [],
          savedBooks: [
            {
              bookKey: "v1:isbn:9780553418026",
              title: "Separate guest copy",
              authors: ["Andy Weir"],
              source: "direct",
              viewedAt: new Date().toISOString(),
            },
          ],
        }),
      ),
    );
    await page
      .getByRole("button", { name: "Download account data", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    const downloaded = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download account data", exact: true })
      .click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe("mybookshelf-account.json");
    const data = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(data.schemaVersion).toBe(1);
    expect(data.profile.email).toBe(email);
    expect(data.profile.signInMethods).toEqual(["password"]);
    expect(data.savedBooks).toEqual([]);
    for (const forbidden of [
      "authUserId",
      "sessionId",
      "accessToken",
      "csrfToken",
      "passwordHash",
    ])
      expect(JSON.stringify(data)).not.toContain(forbidden);
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Delete account", exact: true }),
    ).toBeFocused();
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Synthetic export reader",
    );
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      dialog.getByText("This permanently deletes your account.", {
        exact: false,
      }),
    ).toBeVisible();
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () =>
            document.activeElement === document.body ||
            Boolean(document.activeElement?.closest("dialog")),
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: testInfo.outputPath("account-delete-confirmation.png"),
      fullPage: true,
    });
    const a11y = await new AxeBuilder({ page })
      .include("dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    await dialog
      .getByLabel("I understand and want to delete my account.")
      .check();
    let deletionPosts = 0,
      nonce = "";
    await page.route("**/api/account/deletion", async (route) => {
      deletionPosts++;
      nonce = route.request().postDataJSON().receiptNonce;
      await route.fetch();
      await route.abort("failed");
    });
    await dialog
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/account\/deletion$/);
    await expect(page.getByRole("alert")).toContainText(
      "Couldn’t confirm the response",
    );
    await page
      .getByRole("button", { name: "Check deletion status", exact: true })
      .click();
    await expect(
      page.getByText("Your deletion request is durably recorded", {
        exact: false,
      }),
    ).toBeVisible();
    expect(deletionPosts).toBe(1);
    expect(nonce).toHaveLength(43);
    const storage = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    );
    expect(storage).not.toContain(nonce);
    expect(page.url()).not.toContain(nonce);
    expect(
      (
        await request.post("/__accounts_test__/deletion-jobs", {
          data: { email },
        })
      ).ok(),
    ).toBeTruthy();
    await page
      .getByRole("button", { name: "Check deletion status", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Account cleanup complete" }),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/account/session")).json()).status,
    ).toBe("guest");
    expect(deletionPosts).toBe(1);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("mybookshelf.anonymous-web.v1"))
            .savedBooks[0].title,
      ),
    ).toBe("Separate guest copy");
  } finally {
    await request.post("/__accounts_test__/cleanup", { data: { email } });
  }
});
