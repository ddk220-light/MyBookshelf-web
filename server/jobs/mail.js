import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { getCurrentAdapter } from "@better-auth/core/context";
import { createEmailVerificationToken } from "better-auth/api";

function key(secret) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("Account mail encryption is not configured.");
  return hkdfSync("sha256", secret, "", "mybookshelf-mail-v1", 32);
}
export function encryptMail(payload, secret) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload)),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptMail(value, secret) {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1") throw new Error("Unsupported account mail version.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "base64url")),
      cipher.final(),
    ]).toString(),
  );
}
export const challengeDigest = (token) =>
  createHash("sha256").update(token).digest("hex");

export async function enqueueAccountMail(auth, config, kind, data, token) {
  const context = await auth.$context;
  const adapter = await getCurrentAdapter(context.adapter);
  const stored = ["verify", "newEmail"].includes(kind)
    ? await adapter.findOne({
        model: "user",
        where: [{ field: "id", value: data.user.id }],
      })
    : null;
  if (
    kind === "verify" &&
    stored?.emailVerified &&
    stored.email !== data.user.email
  )
    kind = "newEmail";
  // The pinned library's default JWT has second precision and no random ID.
  // Its public issuer accepts extra claims: a unique jti prevents a cancelled
  // token becoming valid again when a new link is requested in that same second.
  if (token && stored && ["verify", "newEmail"].includes(kind))
    token = await createEmailVerificationToken(
      config.secret,
      stored.email,
      kind === "newEmail" ? data.user.email : undefined,
      kind === "newEmail" ? 1800 : 86400,
      {
        jti: randomUUID(),
        ...(kind === "newEmail"
          ? { requestType: "change-email-verification" }
          : {}),
      },
    );
  const now = new Date(),
    expiresAt = new Date(
      now.getTime() +
        (["reset", "newEmail"].includes(kind) ? 1800 : 86400) * 1000,
    );
  if (token && ["verify", "newEmail"].includes(kind)) {
    const purpose = kind === "newEmail" ? "email-change" : "verify";
    await adapter.deleteMany({
      model: "accountChallenge",
      where: [
        { field: "authUserId", value: data.user.id },
        { field: "purpose", value: purpose },
      ],
    });
    await adapter.create({
      model: "accountChallenge",
      data: {
        id: randomUUID(),
        digest: challengeDigest(token),
        authUserId: data.user.id,
        purpose,
        ...(kind === "newEmail" ? { targetEmail: data.user.email } : {}),
        expiresAt,
        createdAt: now,
      },
      forceAllowId: true,
    });
  }
  const id = randomUUID();
  const payload = encryptMail(
    {
      to: data.user.email,
      name: data.user.name,
      kind,
      token,
      provider: data.provider,
      newEmail: data.newEmail,
      baseURL: config.baseURL,
    },
    config.jobSecret,
  );
  await adapter.create({
    model: "accountMail",
    data: {
      id,
      kind,
      authUserId: data.user.id,
      payload,
      status: "queued",
      attempts: 0,
      availableAt: now,
      expiresAt,
      createdAt: now,
    },
    forceAllowId: true,
  });
  return id;
}

const escape = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderAccountMail(payload) {
  const { kind, token, baseURL, name, provider } = payload;
  const templates = {
    verify: [
      "Verify your email for MyBookshelf",
      "Verify your email",
      `Hi ${name || "reader"}, confirm this address to finish creating your MyBookshelf account.`,
      "Verify email",
      "/app/account/verify",
      "The link works for 24 hours and opens a page where you confirm. Use the newest email.",
    ],
    newEmail: [
      "Confirm your new MyBookshelf email",
      "Verify your new email",
      "Confirm this address to finish changing your account email. Your current address stays valid until you continue.",
      "Confirm new email",
      "/app/account/email-change",
      "This link works once, for 30 minutes. Use the newest email. Other signed-in devices will be signed out.",
    ],
    reset: [
      "Reset your MyBookshelf password",
      "Reset your password",
      "Use this link to choose a new password.",
      "Choose a new password",
      "/app/account/reset-password",
      "It works once, for 30 minutes. Changing your password signs you out on every device.",
    ],
    duplicate: [
      "Someone tried to create an account with your email",
      "You already have an account",
      "Someone tried to create a MyBookshelf account with this address. There’s already an account for it.",
      "Sign in",
      "/app/account/sign-in",
      "If this wasn’t you, you don’t need to do anything.",
    ],
    socialRecovery: [
      "Signing in to MyBookshelf",
      `You sign in with ${provider || "a connected provider"}`,
      "Your account doesn’t have a password. Sign in with your connected method, then go to Settings to set a password.",
      "Sign in",
      "/app/account/sign-in",
      "The reset page shows the same message for every address.",
    ],
    passwordChanged: [
      "Your MyBookshelf password was changed",
      "Your password was changed",
      "Your password was changed. Other devices have been signed out.",
      "Review your account",
      "/app/settings/account",
      "If this wasn’t you, reset your password now.",
    ],
    emailRequested: [
      "Change to your MyBookshelf email requested",
      "Email change requested",
      `Someone requested changing your account email${payload.newEmail ? " to " + payload.newEmail : ""}. Your current address remains valid until the new one is confirmed.`,
      "Review your account",
      "/app/settings/account",
      "If this wasn’t you, secure your account now.",
    ],
    emailChanged: [
      "Your MyBookshelf email was changed",
      "Your email was changed",
      "Your account email has been changed.",
      "Review your account",
      "/app/settings/account",
      "If this wasn’t you, contact support and secure your sign-in methods.",
    ],
    methodChanged: [
      "Your MyBookshelf sign-in methods changed",
      "Sign-in methods changed",
      "A sign-in method was connected or disconnected, or a first password was set.",
      "Review sign-in methods",
      "/app/settings/account",
      "If this wasn’t you, secure your account now.",
    ],
    deleted: [
      "Your MyBookshelf account was deleted",
      "Your account was deleted",
      "Access has ended and account cleanup is complete. Independently retained device copies and downloads are unchanged.",
      "Visit MyBookshelf",
      "/app/shelf",
      "No action is needed.",
    ],
  };
  const item = templates[kind];
  if (!item) throw new Error("Unsupported account email kind.");
  const [subject, title, copy, button, path, note] = item;
  const url = new URL(path, baseURL);
  if (token) url.searchParams.set("token", token);
  return {
    subject,
    text: `${title}\n\n${copy}\n\n${button}: ${url.href}\n\n${note}\n\nMyBookshelf`,
    html: `<div style="background:#faf7f1;padding:32px;font:16px/1.6 system-ui,sans-serif;color:#1f1a17"><div style="max-width:480px;margin:auto;background:#fff;border:1px solid #e4ddd2;border-radius:12px;padding:28px"><h1 style="font:500 30px/1.2 Georgia,serif">${escape(title)}</h1><p>${escape(copy)}</p><p><a href="${escape(url.href)}" style="display:inline-block;background:#2f5340;color:white;text-decoration:none;padding:12px 20px;border-radius:8px">${escape(button)}</a></p><p style="font-size:13px;color:#6b6259">${escape(note)}</p><p style="border-top:1px solid #efe9df;padding-top:12px;font-size:12px;color:#6b6259">MyBookshelf</p></div></div>`,
  };
}

export async function runMailBatch(
  pool,
  config,
  { transport, limit = 10, jobId = null } = {},
) {
  const worker = randomUUID();
  // Lease rather than hold a DB transaction while talking to the provider.
  const { rows } = await pool.query(
    `WITH ready AS (
    SELECT id FROM account_mail_jobs WHERE "expiresAt">now()+interval '10 seconds' AND "availableAt"<=now()
      AND ($3::text IS NULL OR id=$3) AND (status='queued' OR (status='running' AND "leaseUntil"<now()))
    ORDER BY "availableAt",id FOR UPDATE SKIP LOCKED LIMIT $1
  ) UPDATE account_mail_jobs j SET status='running', "leaseUntil"=now()+interval '60 seconds',
    attempts=j.attempts+1, "leaseOwner"=$2 FROM ready WHERE j.id=ready.id RETURNING j.*`,
    [limit, worker, jobId],
  );
  const send =
    transport ??
    (async (job, email) => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `account-mail/${job.id}`,
        },
        body: JSON.stringify({
          from: config.mailFrom,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok)
        throw new Error("Mail provider did not accept the request.");
    });
  for (const job of rows) {
    try {
      const payload = decryptMail(job.payload, config.jobSecret);
      await send(job, { ...renderAccountMail(payload), to: payload.to });
      await pool.query(
        `UPDATE account_mail_jobs SET status='sent',payload='',"leaseUntil"=NULL,"leaseOwner"=NULL,"lastError"=NULL WHERE id=$1 AND "leaseOwner"=$2`,
        [job.id, worker],
      );
    } catch {
      await pool.query(
        `UPDATE account_mail_jobs SET status='queued',"leaseUntil"=NULL,"leaseOwner"=NULL,"lastError"='delivery_failed',
        "availableAt"=now()+CASE attempts WHEN 1 THEN 60 WHEN 2 THEN 300 WHEN 3 THEN 900 WHEN 4 THEN 3600 ELSE 14400 END * interval '1 second'
        WHERE id=$1 AND "leaseOwner"=$2`,
        [job.id, worker],
      );
    }
  }
  await pool.query(
    `UPDATE account_mail_jobs SET status='expired',payload='',"leaseUntil"=NULL,"leaseOwner"=NULL,"lastError"=NULL WHERE "expiresAt"<=now()+interval '10 seconds' AND status NOT IN ('sent','expired')`,
  );
  await pool.query(
    `DELETE FROM account_mail_jobs WHERE "createdAt"<now()-interval '2 days' AND status IN ('sent','expired')`,
  );
  return { processed: rows.length };
}
