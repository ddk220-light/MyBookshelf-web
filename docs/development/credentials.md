# Development credentials

No credential values belong in this document, Git, issues or chat messages.
The repository runs and tests without a private repository checkout.

## Runtime and catalog services

For local development copy `.env.example` to `.env` and fill the optional server
values privately. The server uses `GOOGLE_BOOKS_API_KEY` and `CALIL_APP_KEY` for
their respective providers. Keep hosting credentials such as `VERCEL_TOKEN`
outside the application/client bundle. Never prefix secret variables with `VITE_`.

In current Codex Cloud, network secrets are delivered as placeholders; the proxy
substitutes the real value for configured HTTPS destinations. Do not copy those
placeholders into Vercel as real application credentials. Configure the runtime
secrets independently in the hosting project's server environment.

The previous task had network bindings for `VERCEL_TOKEN` at `api.vercel.com`,
`GOOGLE_BOOKS_API_KEY` at `www.googleapis.com`, and `CALIL_APP_KEY` at `api.calil.jp`.
The owner subsequently added GitHub credentials to the saved environment; verify
the new task's effective bindings rather than assuming this older list is current.

## GitHub Projects blocker and how to resume

Repository reads/pushes and issue creation worked as `ddk220-light`. The existing
`GH_TOKEN` was an integration credential; Projects listing/creation returned
`GraphQL: Resource not accessible by integration`. Repository access alone does
not establish access to a user-owned Projects v2 board.

The proposed separate credential is `GH_PROJECT_TOKEN`, a classic personal access
token with `project` scope for this user-owned project, restricted as a Codex
network secret to `api.github.com`. The public repository does not require adding
the broad `repo` scope for this purpose. Scope/expiry/owner must be verified with
the actual credential; presence of a variable is not an authorization check.

To test without changing the normal repository credential, run:

```sh
GH_TOKEN="$GH_PROJECT_TOKEN" gh api user --jq .login
GH_TOKEN="$GH_PROJECT_TOKEN" gh project list --owner ddk220-light --format json
```

Do this only after confirming the named variable is present; never print its
value or run shell tracing. If read access succeeds, continue the already requested
project/backlog creation and link the existing index issue. Preserve the normal
repository credential for repository writes. If the variable is absent or access
still fails, report the exact missing binding/permission without requesting the
token in chat.

The only account-planning issue currently created is
[#1: Accounts and Social Reading](https://github.com/ddk220-light/MyBookshelf-web/issues/1).
The native Project and child issues remain pending. Their outline is checked in
at [the delivery backlog](../plans/2026-10-31-accounts-delivery-backlog.md).

References: [GitHub CLI Projects authentication](https://cli.github.com/manual/gh_project)
and [user-owned Projects credentials](https://github.github.com/gh-aw/reference/auth-projects/#user-owned-projects).

## Applying Codex environment changes

The [current Cloud guide](https://learn.chatgpt.com/docs/environments/cloud-environments#reuse-and-update-saved-state)
documents Edit, save, Republish, then a new task for an updated reusable setup.
[The Help Center](https://help.openai.com/en/articles/20001545-using-codex-cloud)
says published setup changes apply to new tasks and existing tasks retain their
own state. The previous task had no supported tool to reload its configuration.
Checking status was a read, not a refresh or restart.

This does not establish a universal rule for every secret rotation, personal-vault
change, local desktop session or legacy Cloud task. Rotation of an already-bound
network-secret value was not verified. Personal-vault keys must also be requested
by the environment and apply to that environment.

Related public reports exist: [discussion #34699](https://github.com/openai/codex/discussions/34699)
asks to reload permissions while preserving long-running task context; it concerns
desktop permissions, not a verified current-Cloud secret reproduction. Do not
interpret either these reports or an absent live binding as proof the owner failed
to save the environment. This repository now carries the work needed to resume.

## Future account implementation credentials

None are provisioned yet. Requirements include separate development/staging/
production database and auth secrets, a mail service and authenticated sending
domain, Google OAuth web client credentials and exact callbacks, and Apple web
Sign in configuration/signing credentials with client-secret renewal. The Google
Books API key cannot authenticate Google account sign-in. See the foundation
analysis for Apple prerequisites, privacy, retention and operating requirements.
