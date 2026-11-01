import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { Pool } from "pg";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { createAccountService } from "./service.js";
const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "native Google/Apple redirect protocol verifies state, PKCE, signature, issuer, audience and nonce; preserves relay/name and forbids implicit linking",
  {
    skip:
      !connectionString && "Set disposable local ACCOUNT_TEST_DATABASE_URL.",
    timeout: 30_000,
  },
  async (t) => {
    const url = new URL(connectionString);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.endsWith("_test"),
    );
    const admin = new Pool({ connectionString }),
      emails = [],
      codes = new Map(),
      usedCodes = new Set(),
      states = new Set();
    let service;
    const faultName = "oidc_fault_" + randomUUID().replaceAll("-", "");
    t.after(async () => {
      await admin.query(
        `DROP TRIGGER IF EXISTS ${faultName} ON account_mail_jobs; DROP FUNCTION IF EXISTS ${faultName}(); DROP TABLE IF EXISTS ${faultName};`,
      );
      const ids = (
        await admin.query('SELECT id FROM "user" WHERE email=ANY($1::text[])', [
          emails,
        ])
      ).rows.map((r) => r.id);
      await admin.query(
        'DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])',
        [ids],
      );
      await admin.query(
        'DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])',
        [ids],
      );
      await admin.query(
        'DELETE FROM account_provider_cleanup WHERE "authUserId"=ANY($1::text[])',
        [ids],
      );
      await admin.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [
        emails,
      ]);
      await admin.query(
        "DELETE FROM verification WHERE identifier=ANY($1::text[])",
        [[...states].map((state) => "auth-state:" + state)],
      );
      await service?.close();
      await admin.end();
    });
    await migrate(admin);
    await prepareTestRoles(admin);
    await admin.query(`CREATE TABLE ${faultName}(id text PRIMARY KEY); GRANT SELECT ON ${faultName} TO mybookshelf_auth;
      CREATE FUNCTION ${faultName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM ${faultName} WHERE id=NEW."authUserId") THEN RAISE EXCEPTION 'Synthetic notice outage'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER ${faultName} BEFORE INSERT ON account_mail_jobs FOR EACH ROW EXECUTE FUNCTION ${faultName}();`);
    const config = {
      databaseURL: testRoleURL(connectionString, "auth"),
      readingDatabaseURL: testRoleURL(connectionString, "reading"),
      baseURL: "https://accounts.example.test",
      secureCookies: true,
      secret: "test-only-oidc-secret-longer-than-32-characters" + randomUUID(),
      jobSecret: "test-only-mail-secret-longer-than-32-characters",
      resendKey: "synthetic-only",
      mailFrom: "accounts@example.test",
      googleClientId: "synthetic.apps.googleusercontent.com",
      googleClientSecret: "synthetic-google-client-secret",
      appleClientId: "com.example.synthetic.stage",
      appleClientSecret: "synthetic-apple-client-secret",
    };
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      modulusLength: 2048,
    });
    const kid = randomUUID(),
      jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };
    t.mock.method(globalThis, "fetch", async (input, init) => {
      const req = new Request(input, init),
        endpoint = req.url;
      if (
        endpoint === "https://www.googleapis.com/oauth2/v3/certs" ||
        endpoint === "https://appleid.apple.com/auth/keys"
      )
        return Response.json({ keys: [jwk] });
      if (
        ![
          "https://oauth2.googleapis.com/token",
          "https://appleid.apple.com/auth/token",
        ].includes(endpoint)
      )
        throw Error("Unexpected remote test request.");
      const body = new URLSearchParams(await req.text()),
        code = body.get("code"),
        entry = codes.get(code);
      if (!entry || usedCodes.has(code))
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      usedCodes.add(code);
      assert.equal(
        body.get("redirect_uri"),
        config.baseURL + "/api/auth/callback/" + entry.provider,
      );
      assert.equal(
        createHash("sha256")
          .update(body.get("code_verifier"))
          .digest("base64url"),
        entry.challenge,
      );
      const claims = {
        sub: entry.subject,
        email: entry.email,
        email_verified: entry.provider === "apple" ? "true" : true,
        ...(entry.name ? { name: entry.name } : {}),
        nonce: entry.badNonce ? "incorrect-nonce" : entry.nonce,
        picture: "https://example.test/unneeded-provider-photo.jpg",
      };
      const token = await new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid })
        .setIssuedAt()
        .setIssuer(
          entry.badIssuer
            ? "https://wrong.example.test"
            : entry.provider === "google"
              ? "https://accounts.google.com"
              : "https://appleid.apple.com",
        )
        .setAudience(
          entry.badAudience
            ? "incorrect-client"
            : entry.provider === "google"
              ? config.googleClientId
              : config.appleClientId,
        )
        .setExpirationTime("1h")
        .sign(privateKey);
      return Response.json({
        access_token: "synthetic-access-" + code,
        refresh_token: "synthetic-refresh-" + code,
        token_type: "Bearer",
        expires_in: 3600,
        id_token: entry.badSignature ? token.slice(0, -8) + "AAAAAAAA" : token,
      });
    });
    service = await createAccountService(config, {
      checkPassword: async () => {},
    });
    const cookiesFor = (list) =>
      new Headers({ cookie: list.map((c) => c.split(";")[0]).join("; ") });
    const start = async (provider, details = {}, current = new Headers()) => {
      const cookies = [],
        email = details.email ?? randomUUID() + "@example.test";
      if (!emails.includes(email)) emails.push(email);
      const result = details.mode
        ? await service.actions.startProviderAction(
            {
              provider,
              mode: details.mode,
              action: details.action,
              target: details.target,
              proof: details.proof,
            },
            await service.identity(current),
            current,
            (c) => cookies.push(c),
          )
        : await service.actions.signInSocial(
            { provider, returnTo: "/app/shelf" },
            randomUUID(),
            current,
            (c) => cookies.push(c),
          );
      const authorization = new URL(result.url),
        code = randomUUID();
      assert.ok(authorization.searchParams.get("nonce"));
      assert.equal(
        authorization.searchParams.get("code_challenge_method"),
        "S256",
      );
      assert.equal(
        authorization.searchParams.get("redirect_uri"),
        config.baseURL + "/api/auth/callback/" + provider,
      );
      if (provider === "apple") {
        assert.ok(
          cookies.some(
            (c) =>
              c.includes(".state=") &&
              /SameSite=None/i.test(c) &&
              /Secure/i.test(c),
          ),
        );
        assert.equal(
          authorization.searchParams.get("response_mode"),
          "form_post",
        );
      } else
        assert.ok(
          cookies.some((c) => c.includes(".state=") && /SameSite=Lax/i.test(c)),
        );
      const entry = {
        provider,
        email,
        subject: details.subject ?? randomUUID(),
        name: "Synthetic provider reader",
        nonce: authorization.searchParams.get("nonce"),
        challenge: authorization.searchParams.get("code_challenge"),
        ...details,
      };
      codes.set(code, entry);
      states.add(authorization.searchParams.get("state"));
      const headers = cookiesFor(cookies);
      if (provider === "apple")
        headers.set("origin", "https://appleid.apple.com");
      return {
        provider,
        entry,
        code,
        state: authorization.searchParams.get("state"),
        headers,
      };
    };
    const complete = async (flow, overrides = {}) => {
      const cookies = [],
        params = { code: flow.code, state: flow.state, ...overrides };
      if (flow.provider === "apple" && flow.entry.firstName)
        params.user = JSON.stringify({
          name: {
            firstName: flow.entry.firstName,
            lastName: flow.entry.lastName || "",
          },
          email: flow.entry.email,
        });
      const result = await service.actions.oauthCallback(
        flow.provider,
        {
          headers: flow.headers,
          ip: randomUUID(),
          ...(flow.provider === "apple"
            ? { method: "POST", body: params }
            : { method: "GET", query: params }),
        },
        (c) => cookies.push(c),
      );
      return { ...result, cookies, headers: cookiesFor(cookies) };
    };
    const google = await start("google"),
      signed = await complete(google);
    assert.equal(new URL(signed.location).searchParams.has("error"), false);
    assert.ok(
      signed.cookies.some(
        (c) =>
          c.includes("session_token=") &&
          /SameSite=Lax/i.test(c) &&
          /HttpOnly/i.test(c),
      ),
    );
    const identity = await service.identity(signed.headers);
    assert.equal(identity.status, "authenticated");
    assert.equal(identity.user.email, google.entry.email);
    assert.equal(
      (
        await admin.query('SELECT image FROM "user" WHERE id=$1', [
          identity.authUserId,
        ])
      ).rows[0].image,
      null,
      "provider photos are not retained for this private-name UI",
    );
    const account = (
      await admin.query(
        'SELECT "accessToken","refreshToken","idToken" FROM account WHERE "userId"=$1',
        [identity.authUserId],
      )
    ).rows[0];
    assert.notEqual(account.accessToken, "synthetic-access-" + google.code);
    assert.notEqual(account.refreshToken, "synthetic-refresh-" + google.code);
    assert.equal(account.idToken, null);
    assert.ok(
      new URL((await complete(google)).location).searchParams.has("error"),
    );
    for (const failure of [
      "badIssuer",
      "badAudience",
      "badNonce",
      "badSignature",
    ]) {
      const invalid = await start("google", { [failure]: true });
      assert.ok(
        new URL((await complete(invalid)).location).searchParams.has("error"),
      );
      assert.equal(
        (
          await admin.query('SELECT 1 FROM "user" WHERE email=$1', [
            invalid.entry.email,
          ])
        ).rowCount,
        0,
      );
    }
    const wrongState = await start("google");
    assert.ok(
      new URL(
        (
          await complete(wrongState, { state: "not-the-signed-state" })
        ).location,
      ).searchParams.has("error"),
    );
    assert.equal(usedCodes.has(wrongState.code), false);
    const expiredState = await start("google");
    assert.equal(
      (
        await admin.query(
          `UPDATE verification SET "expiresAt"=now()-interval '1 minute', value=jsonb_set(value::jsonb,'{expiresAt}',to_jsonb((extract(epoch from (now()-interval '1 minute'))*1000)::bigint))::text WHERE identifier=$1`,
          ["auth-state:" + expiredState.state],
        )
      ).rowCount,
      1,
    );
    assert.ok(
      new URL((await complete(expiredState)).location).searchParams.has(
        "error",
      ),
    );
    assert.equal(
      usedCodes.has(expiredState.code),
      false,
      "expired native state rejects before code exchange",
    );
    const collision = await start("apple", {
      email: google.entry.email,
      firstName: "Other",
    });
    assert.ok(
      new URL((await complete(collision)).location).searchParams.has("error"),
    );
    assert.equal(
      (
        await admin.query('SELECT 1 FROM account WHERE "userId"=$1', [
          identity.authUserId,
        ])
      ).rowCount,
      1,
    );
    const relay = await start("apple", {
        email: randomUUID() + "@privaterelay.appleid.com",
        name: undefined,
        firstName: "Relay",
        lastName: "Reader",
      }),
      apple = await complete(relay);
    assert.equal(new URL(apple.location).searchParams.has("error"), false);
    const appleIdentity = await service.identity(apple.headers);
    assert.equal(appleIdentity.user.name, "Relay Reader");
    assert.equal(appleIdentity.user.email, relay.entry.email);
    await service.actions.updateProfile(
      { name: "Chosen private name", profileRevision: 0 },
      appleIdentity,
      apple.headers,
      () => {},
    );
    const returning = await start(
        "apple",
        {
          email: relay.entry.email,
          subject: relay.entry.subject,
          name: undefined,
        },
        apple.headers,
      ),
      again = await complete(returning);
    assert.equal(
      (await service.identity(again.headers)).user.name,
      "Chosen private name",
    );
    assert.equal(
      await service.auth.api.getSession({ headers: apple.headers }),
      null,
    );
    const missing = await start("google", { name: undefined }),
      unnamed = await complete(missing);
    assert.equal(
      (await service.identity(unnamed.headers)).needsProfileCompletion,
      true,
    );

    const confirm = async (provider, current, source, action, target) => {
      const flow = await start(
          provider,
          {
            mode: "reauth",
            action,
            target,
            email: source.entry.email,
            subject: source.entry.subject,
          },
          current,
        ),
        response = await complete(flow);
      assert.equal(
        new URL(response.location).searchParams.has("error"),
        false,
        "provider reauth callback succeeds",
      );
      const identity = await service.identity(response.headers);
      assert.equal(identity.status, "authenticated");
      assert.equal(
        await service.auth.api.getSession({ headers: current }),
        null,
        "reauth rotates only the original browser session",
      );
      const result = await service.actions.providerResult(
        { flowId: new URL(response.location).searchParams.get("flow") },
        identity,
      );
      await assert.rejects(
        service.actions.providerResult(
          { flowId: new URL(response.location).searchParams.get("flow") },
          identity,
        ),
        (e) => e.code === "RECENT_AUTH_REQUIRED",
      );
      return { ...response, identity, ...result };
    };
    const beforeIntents = new Set(
      (
        await admin.query(
          'SELECT id FROM account_provider_intents WHERE "sessionId"=$1',
          [identity.sessionId],
        )
      ).rows.map((row) => row.id),
    );
    const expiredIntent = await start(
      "google",
      {
        mode: "reauth",
        action: "export",
        email: google.entry.email,
        subject: google.entry.subject,
      },
      signed.headers,
    );
    const newIntents = (
      await admin.query(
        'SELECT id FROM account_provider_intents WHERE "sessionId"=$1',
        [identity.sessionId],
      )
    ).rows.filter((row) => !beforeIntents.has(row.id));
    assert.equal(newIntents.length, 1);
    await admin.query(
      "UPDATE account_provider_intents SET \"expiresAt\"=now()-interval '1 minute' WHERE id=$1",
      [newIntents[0].id],
    );
    assert.ok(
      new URL((await complete(expiredIntent)).location).searchParams.has(
        "error",
      ),
      "expired intent cannot mint a proof",
    );
    const switched = await start(
      "google",
      {
        mode: "reauth",
        action: "export",
        email: google.entry.email,
        subject: google.entry.subject,
      },
      signed.headers,
    );
    switched.headers.set(
      "cookie",
      switched.headers.get("cookie") +
        "; " +
        again.headers
          .get("cookie")
          .split("; ")
          .filter((cookie) => cookie.includes(".session_token="))
          .join("; "),
    );
    assert.ok(
      new URL((await complete(switched)).location).searchParams.has("error"),
      "another current account cannot finish an old intent",
    );
    const revokedDevice = await complete(
      await start("google", {
        email: google.entry.email,
        subject: google.entry.subject,
      }),
    );
    const revokedFlow = await start(
      "google",
      {
        mode: "reauth",
        action: "export",
        email: google.entry.email,
        subject: google.entry.subject,
      },
      revokedDevice.headers,
    );
    await service.actions.signout(revokedDevice.headers, () => {});
    assert.ok(
      new URL((await complete(revokedFlow)).location).searchParams.has("error"),
      "revoked original session cannot finish an intent",
    );
    assert.equal(
      (await service.identity(signed.headers)).status,
      "authenticated",
    );
    const wrongSubject = await start(
      "google",
      { mode: "reauth", action: "export" },
      signed.headers,
    );
    assert.ok(
      new URL((await complete(wrongSubject)).location).searchParams.has(
        "error",
      ),
    );
    assert.equal(
      (await service.identity(signed.headers)).status,
      "authenticated",
    );
    const linkProof = await confirm(
      "google",
      signed.headers,
      google,
      "provider-link",
    );
    const occupied = await start(
      "apple",
      {
        mode: "link",
        action: "provider-link",
        proof: linkProof.proof,
        email: relay.entry.email,
        subject: relay.entry.subject,
      },
      linkProof.headers,
    );
    assert.ok(
      new URL((await complete(occupied)).location).searchParams.has("error"),
    );
    const freshLinkProof = await confirm(
      "google",
      linkProof.headers,
      google,
      "provider-link",
    );
    const newApple = await start(
      "apple",
      {
        mode: "link",
        action: "provider-link",
        proof: freshLinkProof.proof,
        email: randomUUID() + "@privaterelay.appleid.com",
      },
      freshLinkProof.headers,
    );
    await admin.query(`INSERT INTO ${faultName}(id) VALUES($1)`, [
      identity.authUserId,
    ]);
    assert.ok(
      new URL((await complete(newApple)).location).searchParams.has("error"),
    );
    assert.equal(
      (
        await admin.query('SELECT 1 FROM account WHERE "userId"=$1', [
          identity.authUserId,
        ])
      ).rowCount,
      1,
      "notice failure rolls back native link",
    );
    await admin.query(`DELETE FROM ${faultName} WHERE id=$1`, [
      identity.authUserId,
    ]);
    // The authorization code is one-use even when our transaction rolls back.
    assert.ok(
      new URL((await complete(newApple)).location).searchParams.has("error"),
    );
    const retriedProof = await confirm(
      "google",
      freshLinkProof.headers,
      google,
      "provider-link",
    );
    const retriedApple = await start(
      "apple",
      {
        mode: "link",
        action: "provider-link",
        proof: retriedProof.proof,
        email: newApple.entry.email,
        subject: newApple.entry.subject,
      },
      retriedProof.headers,
    );
    const linkReply = await complete(retriedApple);
    assert.equal(new URL(linkReply.location).searchParams.has("error"), false);
    assert.equal(
      (
        await admin.query('SELECT 1 FROM account WHERE "userId"=$1', [
          identity.authUserId,
        ])
      ).rowCount,
      2,
    );
    assert.equal(
      (await service.identity(retriedProof.headers)).user.email,
      google.entry.email,
      "relay link does not change contact email",
    );
    assert.equal(
      (
        await service.actions.providerResult(
          { flowId: new URL(linkReply.location).searchParams.get("flow") },
          retriedProof.identity,
        )
      ).kind,
      "linked",
    );
    const device2 = await complete(
      await start("google", {
        email: google.entry.email,
        subject: google.entry.subject,
      }),
    );
    const unlink1 = await confirm(
        "google",
        retriedProof.headers,
        google,
        "provider-unlink",
      ),
      unlink2 = await confirm(
        "google",
        device2.headers,
        google,
        "provider-unlink",
      );
    const unlinks = await Promise.allSettled([
      service.actions.unlinkMethod(
        { provider: "google", proof: unlink1.proof },
        unlink1.identity,
        unlink1.headers,
      ),
      service.actions.unlinkMethod(
        { provider: "apple", proof: unlink2.proof },
        unlink2.identity,
        unlink2.headers,
      ),
    ]);
    assert.equal(unlinks.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      unlinks.find((r) => r.status === "rejected").reason.code,
      "LAST_SIGN_IN_METHOD",
    );
    assert.equal(
      (
        await admin.query('SELECT 1 FROM account WHERE "userId"=$1', [
          identity.authUserId,
        ])
      ).rowCount,
      1,
      "concurrent unlink retains a method",
    );
    const setup = await confirm(
      "apple",
      again.headers,
      relay,
      "password-setup",
    );
    const before = await admin.query(
      'SELECT password FROM account WHERE "userId"=$1 AND "providerId"=$2',
      [setup.identity.authUserId, "credential"],
    );
    assert.equal(before.rowCount, 0);
    const testPassword = "A long synthetic first password 5682";
    await admin.query(`INSERT INTO ${faultName}(id) VALUES($1)`, [
      setup.identity.authUserId,
    ]);
    await assert.rejects(
      service.actions.setFirstPassword(
        { password: testPassword, proof: setup.proof },
        setup.identity,
        setup.headers,
      ),
    );
    assert.equal(
      (
        await admin.query(
          'SELECT 1 FROM account WHERE "userId"=$1 AND "providerId"=$2',
          [setup.identity.authUserId, "credential"],
        )
      ).rowCount,
      0,
      "notice failure rolls back first password and leaves proof reusable",
    );
    await admin.query(`DELETE FROM ${faultName} WHERE id=$1`, [
      setup.identity.authUserId,
    ]);
    await service.actions.setFirstPassword(
      { password: testPassword, proof: setup.proof },
      setup.identity,
      setup.headers,
    );
    const passwordCookies = [];
    await service.actions.signin(
      { email: relay.entry.email, password: testPassword },
      randomUUID(),
      new Headers(),
      (c) => passwordCookies.push(c),
    );
    assert.equal(
      (await service.identity(cookiesFor(passwordCookies))).status,
      "authenticated",
    );
    const change = await confirm(
      "apple",
      setup.headers,
      relay,
      "password-change",
    );
    const changedCookies = [];
    await service.actions.changePassword(
      { password: testPassword + " changed", proof: change.proof },
      change.identity,
      change.headers,
      (c) => changedCookies.push(c),
    );
    assert.equal(
      await service.auth.api.getSession({ headers: change.headers }),
      null,
    );
    assert.equal(
      await service.auth.api.getSession({
        headers: cookiesFor(passwordCookies),
      }),
      null,
      "provider-confirmed password change revokes other devices",
    );
    assert.equal(
      (await service.identity(cookiesFor(changedCookies))).status,
      "authenticated",
    );
    await admin.query(
      "UPDATE app_users SET status='deleting' WHERE auth_user_id=$1",
      [identity.authUserId],
    );
    const deleting = await start("google", {
      email: google.entry.email,
      subject: google.entry.subject,
    });
    assert.ok(
      new URL((await complete(deleting)).location).searchParams.has("error"),
    );
    assert.notEqual(
      (await service.identity(unlink1.headers)).status,
      "authenticated",
    );
  },
);
