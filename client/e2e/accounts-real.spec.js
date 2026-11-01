import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
const enabled = process.env.ACCOUNT_E2E === "true";
test.describe("account browser → real API → isolated Postgres", () => {
  test.skip(
    !enabled,
    "Run only against the explicit loopback account harness.",
  );
  for (const light of ["daylight", "lamplight", "ink"])
    test(
      "signup, scanner-safe verification, profile and sign-out in " + light,
      async ({ page, request }) => {
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
          const session = await (
            await page.request.get("/api/account/session")
          ).json();
          expect(session.status).toBe("guest");
        } finally {
          await request.post("/__accounts_test__/cleanup", { data: { email } });
        }
      },
    );
});
