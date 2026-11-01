import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { artifactReference } from "../../tools/accounts/artifact-reference.mjs";
const enabled = process.env.ACCOUNT_E2E === "true";
test("account screens match reviewed layout and remain usable in three lights, narrow widths and zoom", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.skip(!enabled, "Explicit disposable local account harness required.");
  test.setTimeout(180000);
  const origin = process.env.PLAYWRIGHT_BASE_URL,
    email = "pw-" + randomUUID().slice(0, 8) + "@example.test",
    password = "Synthetic visual review password " + randomUUID();
  const output = testInfo.outputPath("review");
  await mkdir(output, { recursive: true });
  const matrix = [];
  const reference = await browser.newPage();
  const capture = async (
    name,
    artifact,
    variant = "normal",
    width = 390,
    light = "daylight",
  ) => {
    await page.bringToFront();
    await page.setViewportSize({ width, height: 900 });
    // WebKit's screenshot/resize sequence can retain the previous stylesheet
    // media evaluation. Reassert normal screen media before checking its CSS.
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    // WebKit can acknowledge a resize before applying its media-query layout.
    // Wait for the real responsive CSS rather than capturing the previous size.
    await expect
      .poll(
        () =>
          page.locator(".app-frame").evaluate((node) => ({
            width: innerWidth,
            desktop: matchMedia("(min-width:1024px)").matches,
            grid: getComputedStyle(node).display === "grid",
          })),
        { message: `Responsive layout for ${name}/${light}/${width}` },
      )
      .toEqual({ width, desktop: width >= 1024, grid: width >= 1024 });
    await page.evaluate((light) => {
      localStorage.setItem(
        "mybookshelf.appearance.v1",
        JSON.stringify({ version: 1, preference: light }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: "mybookshelf.appearance.v1" }),
      );
    }, light);
    // The appearance hook responds to the same preference event used by another tab.
    await expect(page.locator("html")).toHaveAttribute("data-light", light);
    await page.evaluate(() => document.fonts.ready);
    await reference.setViewportSize({ width, height: 900 });
    await reference.setContent(
      artifactReference({
        screen: artifact,
        variant,
        device: width >= 1000 ? "desktop" : width === 320 ? "narrow" : "phone",
        light,
      }),
    );
    await reference.evaluate(() => document.fonts.ready);
    const key = [name, light, width].join("-");
    await page.screenshot({ path: output + "/" + key + "-app.png" });
    await reference.screenshot({ path: output + "/" + key + "-artifact.png" });
    expect(
      await page
        .locator("main")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    if (name === "settings") {
      await page
        .getByRole("region", { name: "Your data", exact: true })
        .scrollIntoViewIfNeeded();
      await reference.locator(".card").last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + "/" + key + "-bottom-app.png" });
      await reference.screenshot({
        path: output + "/" + key + "-bottom-artifact.png",
      });
      await page.locator("main").evaluate((node) => (node.scrollTop = 0));
      await reference
        .locator(".scroll")
        .evaluate((node) => (node.scrollTop = 0));
    }
    const typography = await page.evaluate(() => ({
      scale: "100%",
      devicePixelRatio: devicePixelRatio,
      headingPx: parseFloat(
        getComputedStyle(document.querySelector("h1")).fontSize,
      ),
      bodyPx: parseFloat(
        getComputedStyle(
          document.querySelector(".account-page,.account-settings-page") ||
            document.body,
        ).fontSize,
      ),
    }));
    matrix.push({
      typography,
      name,
      artifact,
      variant,
      width,
      light,
      app: key + "-app.png",
      reference: key + "-artifact.png",
    });
  };
  try {
    for (const light of ["daylight", "lamplight", "ink"]) {
      for (const [route, screen, title] of [
        ["sign-up", "signUp", "Create account"],
        ["sign-in", "signIn", "Sign in"],
        ["forgot-password", "forgot", "Reset your password"],
      ]) {
        await page.goto("/app/account/" + route);
        await expect(
          page.getByRole("heading", { name: title, exact: true }),
        ).toBeVisible();
        for (const width of [320, 390, 768, 1440])
          await capture(route, screen, "normal", width, light);
      }
    }
    await page.goto("/app/account/sign-up");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Check 2 fields");
    await expect(page.getByRole("alert")).toBeFocused();
    await capture("sign-up-errors", "signUp", "errors");
    await page
      .getByRole("alert")
      .getByRole("link", { name: "Use between 15 and 128 characters." })
      .click();
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await page.getByLabel("Your name", { exact: true }).fill("Reader Example");
    await page.getByLabel("Password", { exact: true }).fill(password);
    let releaseSignup;
    await page.route("**/api/account/sign-up", async (route) => {
      await new Promise((resolve) => {
        releaseSignup = resolve;
      });
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Creating account…", exact: true }),
    ).toBeDisabled();
    await capture("sign-up-pending", "signUp", "submitting");
    releaseSignup();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.unroute("**/api/account/sign-up");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeFocused();
    await expect(page).toHaveTitle("Check your email — MyBookshelf");
    await capture("check-email", "checkEmail");
    const { token } = await (
      await request.post("/__accounts_test__/mail", { data: { email } })
    ).json();
    await page.goto("/app/account/verify?token=" + encodeURIComponent(token));
    await expect(
      page.getByRole("button", { name: "Verify email", exact: true }),
    ).toBeVisible();
    await capture("verify-ready", "verify", "ready");
    await page
      .getByRole("button", { name: "Verify email", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Email verified", exact: true }),
    ).toBeVisible();
    // Exercise the complete recovery UI using only the loopback synthetic outbox.
    await page.goto("/app/account/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "Send reset link", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Check your email", exact: true }),
    ).toBeVisible();
    await capture("forgot-sent", "forgot", "sent");
    const resetReply = await request.post("/__accounts_test__/mail", {
      data: { email, kind: "reset" },
    });
    expect(resetReply.ok()).toBeTruthy();
    const resetToken = (await resetReply.json()).token;
    await page.goto(
      "/app/account/reset-password?token=" + encodeURIComponent(resetToken),
    );
    await expect(
      page.getByLabel("New password", { exact: true }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/token=/);
    await capture("reset-ready", "reset");
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Password updated", exact: true }),
    ).toBeVisible();
    await capture("reset-done", "reset", "done");
    await page.goto(
      "/app/account/reset-password?token=" + encodeURIComponent(resetToken),
    );
    await page.getByLabel("New password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await capture("reset-used", "reset", "expired");
    await page.goto("/app/account/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("A deliberately wrong synthetic password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toBeFocused();
    await capture("sign-in-error", "signIn", "bad");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    expect(
      (
        await request.post("/__accounts_test__/missing-name", {
          data: { email },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto("/app/settings/account");
    await expect(
      page.getByRole("heading", { name: "Add your name", exact: true }),
    ).toBeVisible();
    await capture("complete-name", "completeName");
    await page.getByLabel("Your name", { exact: true }).fill("Reader Example");
    await page
      .getByRole("button", { name: "Save and continue", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/settings\/account$/);
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
    for (const light of ["daylight", "lamplight", "ink"]) {
      await page.goto("/app/settings/account");
      await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
        "Reader Example",
      );
      for (const width of [320, 390, 768, 1440])
        await capture("settings", "settingsAccount", "normal", width, light);
      const a11y = await new AxeBuilder({ page })
        .include(".account-settings-page")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(a11y.violations).toEqual([]);
    }
    const themeTab = await page.context().newPage();
    await themeTab.goto("/app/settings");
    await themeTab
      .getByRole("button", { name: "Lamplight", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-light",
      "lamplight",
    );
    await themeTab.close();
    await page
      .getByRole("button", { name: "Change email", exact: true })
      .click();
    let emailDialog = page.getByRole("dialog");
    await emailDialog.getByLabel("Password", { exact: true }).fill(password);
    await emailDialog
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await emailDialog
      .getByLabel("New email", { exact: true })
      .fill(email.replace("@", "-new@"));
    await capture("email-change", "changeEmail");
    await emailDialog
      .getByRole("button", { name: "Change email", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel email change", exact: true }),
    ).toBeVisible();
    await capture("email-pending", "settingsAccount", "emailPending");
    await page
      .getByRole("button", { name: "Cancel email change", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel email change", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Review import", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bring books over", exact: true }),
    ).toBeVisible();
    await capture("import", "importBooks");
    const imports = [];
    await page.route("**/api/account/imports", async (route) => {
      imports.push(route.request().postDataJSON());
      await route.fetch();
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Bring books over", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Couldn’t confirm the import",
    );
    await expect(
      page.getByRole("button", { name: "Retry import", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Include recently viewed books from the last 30 days"),
    ).toBeDisabled();
    await capture("import-uncertain", "importBooks", "failed");
    await page.unroute("**/api/account/imports");
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/api/account/imports")
        imports.push(req.postDataJSON());
    });
    await page
      .getByRole("button", { name: "Retry import", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Books imported", exact: true }),
    ).toBeVisible();
    expect(imports).toHaveLength(2);
    expect(imports[1]).toEqual(imports[0]);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("mybookshelf.anonymous-web.v1"))
            .savedBooks,
      ),
    ).toHaveLength(1);
    await capture("import-done", "importBooks", "done");
    await page.goto("/app/shelf");
    await capture("shelf-account", "shelfSync");
    await page.goto("/app/settings/account");
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Reader Example",
    );
    await page
      .getByLabel("Your name", { exact: true })
      .fill("Reader " + "Ж".repeat(73));
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(page.getByText("Name saved", { exact: true })).toBeVisible();
    await capture("name-long", "settingsAccount", "saved", 320);
    await page.getByLabel("Your name", { exact: true }).fill("Reader Example");
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(page.getByText("Name saved", { exact: true })).toBeVisible();
    let releaseHistory;
    await page.route("**/api/account/history/settings", async (route) => {
      await new Promise((resolve) => {
        releaseHistory = resolve;
      });
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "SYNTHETIC_OUTAGE",
            message: "Couldn’t update history. Try again.",
          },
        },
      });
    });
    await page.getByRole("switch").click();
    await expect(page.getByRole("switch")).toBeDisabled();
    await capture("history-pending", "historyConsent");
    releaseHistory();
    await expect(
      page
        .locator(".account-sync-notice")
        .getByText("Couldn’t update history. Try again.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.unroute("**/api/account/history/settings");
    await page
      .getByRole("button", { name: "Retry change", exact: true })
      .click();
    await expect(page.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await capture("history-on", "historyConsent");
    await page.getByRole("switch").click();
    await expect(page.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page
      .getByRole("button", { name: "Clear saved books", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
    await capture("clear-saved", "clearSaved");
    let releaseClear;
    const clears = [];
    await page.route("**/api/account/books/clear", async (route) => {
      clears.push(route.request().postDataJSON());
      await new Promise((resolve) => {
        releaseClear = resolve;
      });
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "SYNTHETIC_OUTAGE",
            message: "Couldn’t clear saved books. Try again.",
          },
        },
      });
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Clear saved books", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await capture("clear-pending", "clearSaved");
    releaseClear();
    await expect(page.getByRole("dialog").getByRole("alert")).toBeFocused();
    await capture("clear-error", "clearSaved");
    await page.unroute("**/api/account/books/clear");
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/api/account/books/clear")
        clears.push(req.postDataJSON());
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Clear saved books", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(clears).toHaveLength(2);
    expect(clears[1]).toEqual(clears[0]);
    expect(
      (await (await page.request.get("/api/account/books")).json()).books,
    ).toHaveLength(0);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("mybookshelf.anonymous-web.v1"))
            .savedBooks,
      ),
    ).toHaveLength(1);
    await page
      .getByRole("button", { name: "Clear saved books", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Clear saved books", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Download account data", exact: true })
      .click();
    const exportDialog = page.getByRole("dialog");
    await exportDialog.getByLabel("Password", { exact: true }).fill(password);
    await exportDialog
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(
      exportDialog.getByRole("heading", {
        name: "Download account data",
        exact: true,
      }),
    ).toBeVisible();
    await capture("export-ready", "exportData");
    await page.route("**/api/account/export", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: {
            code: "SYNTHETIC_OUTAGE",
            message: "Couldn’t prepare your export. Try again.",
          },
        },
      }),
    );
    await exportDialog
      .getByRole("button", { name: "Download account data", exact: true })
      .click();
    await expect(exportDialog.getByRole("alert")).toBeFocused();
    await capture("export-error", "exportData", "error");
    await page.unroute("**/api/account/export");
    const downloaded = page.waitForEvent("download");
    await exportDialog
      .getByRole("button", { name: "Download account data", exact: true })
      .click();
    expect((await downloaded).suggestedFilename()).toBe(
      "mybookshelf-account.json",
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Download started" }),
    ).toBeVisible();
    await capture("export-done", "exportData", "done");
    await page
      .getByRole("button", { name: "Delete account", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Confirm it’s you", exact: true }),
    ).toBeVisible();
    await capture("reauth", "reauth");
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      dialog.getByLabel("I understand and want to delete my account."),
    ).toBeVisible();
    for (const light of ["daylight", "lamplight", "ink"])
      for (const width of [320, 390, 1440])
        await capture("delete-confirm", "deleteAcct", "normal", width, light);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    await expect(
      page.getByRole("button", { name: "Delete account", exact: true }),
    ).toBeVisible();
    expect(
      await page
        .locator("main")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    for (const label of await page.locator(".tab-label:visible").all())
      expect(
        await label.evaluate(
          (node) => node.scrollWidth <= node.clientWidth + 1,
        ),
      ).toBe(true);
    await page.screenshot({ path: output + "/settings-320-text-200.png" });
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    if (testInfo.project.name.includes("chromium")) {
      await page.emulateMedia({ forcedColors: "active" });
      await page.getByLabel("Your name", { exact: true }).focus();
      await expect(page.getByLabel("Your name", { exact: true })).toBeFocused();
      await page.screenshot({ path: output + "/settings-forced-colors.png" });
    }
    await page.emulateMedia({ forcedColors: "none" });
    await page.route("**/api/account/sign-out", async (route) => {
      await route.fetch();
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Sign out here", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Couldn’t finish signing out",
    );
    await capture("signout-uncertain", "signOut", "unconfirmed");
    await page.unroute("**/api/account/sign-out");
    await page
      .getByRole("button", { name: "Retry sign out", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/account/session")).json())
            .status,
      )
      .toBe("guest");
    await page.goto("/app/settings");
    await capture("settings-guest", "settingsGuest");
    await page.goto("/app/account/sign-up");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    const reveal = await page.locator(".account-password").evaluate((node) => {
      const input = node.querySelector("input"),
        button = node.querySelector("button");
      return {
        textRight:
          input.getBoundingClientRect().right -
          parseFloat(getComputedStyle(input).paddingRight),
        buttonLeft: button.getBoundingClientRect().left,
      };
    });
    expect(reveal.textRight).toBeLessThanOrEqual(reveal.buttonLeft);
    expect(
      await page
        .locator("main")
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: output + "/sign-up-320-text-200.png" });
  } finally {
    await writeFile(output + "/matrix.json", JSON.stringify(matrix, null, 2));
    await reference.close();
    await request.post("/__accounts_test__/cleanup", { data: { email } });
  }
});
