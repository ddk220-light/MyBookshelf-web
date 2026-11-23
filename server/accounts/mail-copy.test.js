import assert from "node:assert/strict";
import test from "node:test";
import { renderAccountMail, SUPPORT_EMAIL } from "../jobs/mail.js";

// The words of the account emails (server/jobs/mail.js). No database needed.
const KINDS = ["verify", "newEmail", "magicLink", "reset", "duplicate", "socialRecovery", "passwordChanged", "emailRequested", "emailChanged", "methodChanged", "deleted"];
const render = (kind, extra = {}) => renderAccountMail({ kind, baseURL: "https://mybookshelf.cloud", name: "Reader", ...extra });

test("the email-changed notice gives the contact address, in the text and the HTML", () => {
  assert.equal(SUPPORT_EMAIL, "privacy@mybookshelf.cloud");
  const mail = render("emailChanged");
  assert.match(mail.text, /If this wasn’t you, write to us at privacy@mybookshelf\.cloud and secure your sign-in methods\./);
  assert.ok(mail.html.includes("privacy@mybookshelf.cloud"));
});

test("no account email asks the reader to contact support without saying how", () => {
  for (const kind of KINDS) {
    const { subject, text, html } = render(kind, { token: kind === "magicLink" ? "t" : undefined });
    assert.ok(subject && text && html, kind);
    if (/support|contact|write to us/i.test(text)) assert.ok(text.includes(SUPPORT_EMAIL), kind);
  }
  assert.throws(() => render("unknown"), /Unsupported account email kind/);
});
