// Account screens through the real loopback harness (ACCOUNT_E2E=true): each
// screen the side panel leads to, in all three reading lights, at 390 and 320
// px, with doubled text and forced colors. Checks axe (WCAG 2.2 AA), no
// sideways scrolling, 44 px targets and saves a screenshot of each for review
// against docs/design/2026-11-one-shelf/ (AccountStates, AccountSettings).
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

const enabled = process.env.ACCOUNT_E2E === "true";
const axe = (page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();

async function check(page, testInfo, name) {
  expect((await axe(page)).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name + ": no sideways scroll").toBe(true);
  // Every visible button, link and field in the account screen is at least 44 px tall, except links inside a sentence.
  const small = await page.evaluate(() => [...document.querySelectorAll("main button, main a, main input, dialog[open] button, dialog[open] a, dialog[open] input")]
    .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden")
    .map((element) => ({ text: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || "").trim().slice(0, 40), height: element.getBoundingClientRect().height, inline: element.tagName === "A" && Boolean(element.closest("p")) && element.closest("p").textContent.trim() !== element.textContent.trim() }))
    // A link inside a sentence is exempt from the target size (WCAG 2.5.8 "inline"); it must still be a line of text.
    .filter((target) => target.height < (target.inline ? 16 : 44) - 0.5));
  expect(small, name + ": small targets").toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(name + ".png"), fullPage: true });
}

test.describe("account screens: lights, widths, zoom and forced colors", () => {
  test.skip(!enabled, "Run only against the explicit loopback account harness.");

  for (const light of ["daylight", "lamplight", "ink"])
    for (const width of [390, 320])
      test(`${light} at ${width}px`, async ({ page, request }, testInfo) => {
        const email = "pw-" + randomUUID() + "@example.test", password = "a synthetic visual password " + randomUUID();
        await page.setViewportSize({ width, height: 844 });
        await page.addInitScript((value) => localStorage.setItem("mybookshelf.appearance.v1", JSON.stringify({ version: 1, preference: value })), light);
        try {
          await page.goto("/app/shelf");
          await page.getByRole("button", { name: "Account and settings" }).click();
          const panel = page.getByRole("dialog", { name: "Account and settings" });
          await expect(panel.getByRole("link", { name: "Create account" })).toBeVisible();
          await check(page, testInfo, `panel-signed-out-${light}-${width}`);
          await panel.getByRole("link", { name: "Create account" }).click();
          await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
          await page.getByLabel("Email", { exact: true }).fill(email);
          await page.getByLabel("Password", { exact: true }).fill("short");
          await page.getByRole("button", { name: "Create account", exact: true }).click();
          await expect(page.getByRole("alert")).toHaveText("Too short: 15 characters or more");
          await check(page, testInfo, `create-account-error-${light}-${width}`);
          await page.getByLabel("Password", { exact: true }).fill(password);
          await page.getByRole("button", { name: "Create account", exact: true }).click();
          await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
          await check(page, testInfo, `check-email-${light}-${width}`);
          const { token } = await (await request.post("/__accounts_test__/mail", { data: { email } })).json();
          await page.goto("/app/account/verify?token=" + encodeURIComponent(token));
          await expect(page.getByRole("button", { name: "Verify email", exact: true })).toBeVisible();
          await check(page, testInfo, `verify-${light}-${width}`);
          await page.getByRole("button", { name: "Verify email", exact: true }).click();
          await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
          await page.getByRole("link", { name: "Log in", exact: true }).click();
          await page.getByLabel("Email", { exact: true }).fill(email);
          await page.getByLabel("Password", { exact: true }).fill("not the synthetic password at all");
          await page.getByRole("button", { name: "Log in", exact: true }).click();
          await expect(page.getByRole("alert")).toHaveText("Wrong email or password");
          await check(page, testInfo, `log-in-error-${light}-${width}`);
          await page.getByLabel("Password", { exact: true }).fill(password);
          await page.getByRole("button", { name: "Log in", exact: true }).click();
          await expect(page).toHaveURL(/\/app\/shelf$/);
          await page.getByRole("button", { name: "Account and settings" }).click();
          await expect(panel.getByText(email, { exact: true })).toBeVisible();
          await check(page, testInfo, `panel-signed-in-${light}-${width}`);
          await panel.getByRole("link", { name: "Account settings" }).click();
          await expect(page.getByText(email, { exact: true })).toBeVisible();
          await check(page, testInfo, `account-settings-${light}-${width}`);
          await page.getByRole("button", { name: "Delete account" }).click();
          const dialog = page.getByRole("alertdialog", { name: "Delete account and shelf?" });
          await expect(dialog.getByLabel("Password")).toBeFocused();
          await check(page, testInfo, `delete-confirm-${light}-${width}`);
          await page.keyboard.press("Escape");
          await expect(page.getByRole("button", { name: "Delete account" })).toBeFocused();
        } finally {
          await request.post("/__accounts_test__/cleanup", { data: { email } });
        }
      });

  test("doubled text and forced colors keep the account screens usable", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ forcedColors: "active" });
    await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = "200%"; }));
    for (const path of ["/app/account/sign-up", "/app/account/sign-in", "/app/account/forgot-password"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true);
      expect((await axe(page)).violations, path).toEqual([]);
      for (const field of await page.getByRole("textbox").all()) await expect(field).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("zoom-forced" + path.replaceAll("/", "-") + ".png"), fullPage: true });
    }
  });
});
