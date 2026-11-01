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

## GitHub Projects access and current project

Authenticated listing and project creation were verified on 2026-10-31 through
GitHub's official Projects MCP endpoint:
`https://api.githubcopilot.com/mcp/x/projects`.
The current cloud environment binds `GH_PROJECT_TOKEN` to
`api.githubcopilot.com`; preserve its proxy and TLS trust settings. A placeholder
in the process environment is not evidence of a missing credential.

The [Account Management project](https://github.com/users/ddk220-light/projects/3)
and [index issue #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1)
now exist with the published delivery backlog. Reuse them. The earlier
`Resource not accessible by integration` error concerned the normal GitHub
integration credential and does not describe this verified MCP connection.

The built-in GitHub connector handles repository issues. Projects tools are
available from the separate official MCP service (`projects_get`, `projects_list`,
`projects_write`). In this cloud environment, the existing helper at
`/workspace/github-projects/client.py` speaks that protocol without saving tokens:

```sh
python3 /workspace/github-projects/client.py tools
python3 /workspace/github-projects/client.py list ddk220-light
```

These commands are read-only. Project mutations must match the requested work.
Inspect the current tool schema and use exact returned IDs; check for existing
projects/items before retrying a creation with an uncertain outcome. Repository
APIs provide native sub-issue and blocked-by links not exposed by the built-in
connector. Never send `GH_PROJECT_TOKEN` to a different destination or print it.

Readiness and capabilities can change between environments: inspect effective
bindings and verify authenticated read access before diagnosing permissions.
Do not infer Projects access from repository access alone, and do not request
secrets in chat. [The delivery backlog](../plans/2026-10-31-accounts-delivery-backlog.md)
records the current issues and review gates.

Reference: [GitHub remote MCP service](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md).

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
