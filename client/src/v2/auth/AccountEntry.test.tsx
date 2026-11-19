import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AnonymousWebApp } from "../App";
import { forgetAccountWarmUp } from "../ui/account/AccountEntryGate";
const response = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200 });
const ready = {
  email: true,
  google: false,
  apple: false,
  canonicalOrigin: window.location.origin,
};
const unavailable = (code = "ACCOUNT_DISABLED") =>
  new Response(
    JSON.stringify({ error: { code, message: "Accounts unavailable." } }),
    { status: 503 },
  );
afterEach(() => {
  cleanup();
  forgetAccountWarmUp();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});
it("keeps typed account fields when initial session checking finishes", async () => {
  let finish: (value: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) =>
      path.endsWith("/session")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(
            response(
              path.endsWith("/capabilities")
                ? {
                    email: true,
                    google: false,
                    apple: false,
                    canonicalOrigin: window.location.origin,
                  }
                : { status: "check-email" },
            ),
          ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/app/account/sign-up"]}>
      <AnonymousWebApp />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
    target: { value: "synthetic@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "a long synthetic test password" },
  });
  await act(async () => finish(response({ status: "guest" })));
  expect(screen.getByLabelText("Email", { exact: true })).toHaveValue(
    "synthetic@example.test",
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeEnabled(),
  );
  fireEvent.submit(screen.getByRole("form", { name: "Welcome to MyBookshelf" }));
  expect(
    await screen.findByRole("heading", { name: "Check your email" }),
  ).toBeInTheDocument();
});
function Location() {
  const location = useLocation();
  return (
    <span data-testid="location">{location.pathname + location.search + location.hash}</span>
  );
}
for (const route of [
  "sign-up",
  "sign-in",
  "forgot-password",
  "reset-password",
  "verify",
])
  it(`blocks ${route} when account service is disabled and preserves browser books`, async () => {
    const guest = JSON.stringify({
      version: 1,
      selectedLibraryId: null,
      recentBooks: [],
      savedBooks: [
        {
          bookKey: "v1:isbn:9780262033848",
          isbn13: "9780262033848",
          title: "Synthetic browser shelf",
          authors: ["Synthetic author"],
          source: "direct",
          viewedAt: "2026-10-31T00:00:00.000Z",
        },
      ],
    });
    localStorage.setItem("mybookshelf.anonymous-web.v1", guest);
    const fetch = vi.fn(() => Promise.resolve(unavailable()));
    vi.stubGlobal("fetch", fetch);
    render(
      <MemoryRouter initialEntries={["/app/account/" + route]}>
        <AnonymousWebApp />
        <Location />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Accounts aren’t available right now",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Email", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Password", { exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue using this browser" }),
      { detail: 2 },
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/app/account/" + route,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Continue using this browser",
      }),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(
      JSON.parse(localStorage.getItem("mybookshelf.anonymous-web.v1")!)
        .savedBooks,
    ).toEqual(JSON.parse(guest).savedBooks);
    expect(
      await screen.findByRole("link", { name: "Synthetic browser shelf by Synthetic author" }),
    ).toBeInTheDocument();
    // Nothing was submitted: the shelf's own suggestions only ask with GET
    // (book keys only, no account data), so nothing was posted.
    expect(
      fetch.mock.calls.every(
        (args) => (args as unknown as [string, RequestInit])[1]?.method !== "POST",
      ),
    ).toBe(true);
  });
it("retries unavailable signup and submits only after session and mail availability are ready", async () => {
  let healthy = false;
  let finishCapabilities: (value: Response) => void = () => {};
  const fetch = vi.fn((path: string, options: RequestInit) => {
    if (path.endsWith("/session"))
      return Promise.resolve(
        healthy
          ? response({ status: "guest" })
          : unavailable("ACCOUNT_UNAVAILABLE"),
      );
    if (path.endsWith("/capabilities"))
      return new Promise<Response>((resolve) => {
        finishCapabilities = resolve;
      });
    return Promise.resolve(response({ status: "check-email" }));
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <MemoryRouter initialEntries={["/app/account/sign-up"]}>
      <AnonymousWebApp />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", {
    name: "Accounts aren’t available right now",
  });
  healthy = true;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  const email = await screen.findByLabelText("Email", { exact: true });
  fireEvent.change(email, {
    target: { value: "reader@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "a long synthetic password" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Welcome to MyBookshelf" }));
  expect(
    fetch.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(0);
  await act(async () => finishCapabilities(response(ready)));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeEnabled(),
  );
  expect(email).toHaveValue("reader@example.test");
  fireEvent.submit(screen.getByRole("form", { name: "Welcome to MyBookshelf" }));
  await screen.findByRole("heading", { name: "Check your email" });
  expect(
    fetch.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
});
for (const route of ["sign-up", "forgot-password"])
  it(`does not offer ${route} when mail is unavailable`, async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        Promise.resolve(
          response(
            path.endsWith("/session")
              ? { status: "guest" }
              : { ...ready, email: false },
          ),
        ),
      ),
    );
    render(
      <MemoryRouter initialEntries={["/app/account/" + route]}>
        <AnonymousWebApp />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Accounts aren’t available right now",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Email", { exact: true }),
    ).not.toBeInTheDocument();
  });
const USER = { id: "reader-1", name: "Reader", email: "reader@example.test", emailVerified: true };
const versions = { settingsRevision: 0, shelfRevision: 0, historyGeneration: 0, historyEnabled: true };
/** The account API after an emailed link signed the reader in. */
function signedInAfter(posts: string[], linkPath: string, gate: { open: boolean }, finish?: (resolve: (value: Response) => void) => void) {
  return vi.fn((path: string, options: RequestInit = {}) => {
    // Naming the link's account first uses nothing up.
    if (path.endsWith("/link-info")) return Promise.resolve(response({ status: "valid", email: USER.email }));
    if (options.method === "POST") posts.push(path);
    if (path.endsWith("/session")) {
      if (!gate.open && finish) return new Promise<Response>((resolve) => finish(resolve));
      return Promise.resolve(response(gate.open ? { status: "authenticated", user: USER, csrfToken: "csrf-1", signedInAt: new Date().toISOString() } : { status: "guest" }));
    }
    if (path.endsWith(linkPath)) {
      gate.open = true;
      return Promise.resolve(response({ status: "verified", signedIn: true, email: USER.email }));
    }
    if (path.endsWith("/state")) return Promise.resolve(response({ profile: { ...USER, profileRevision: 0 }, selectedLibraryId: null, selectedLibrary: null, libraryRemoved: false, counts: { saved: 0, recent: 0 }, ...versions }));
    if (path.includes("/books?")) return Promise.resolve(response({ books: [], nextCursor: null, ...versions }));
    if (path.endsWith("/history")) return Promise.resolve(response({ books: [], ...versions }));
    return Promise.resolve(response({ status: "ok" }));
  });
}
it("keeps the verification token after # until it is used, exchanges it only on confirmation, and signs the reader in to Welcome", async () => {
  let finish: (value: Response) => void = () => {};
  const posts: string[] = [], gate = { open: false };
  vi.stubGlobal("fetch", signedInAfter(posts, "/verify-email", gate, (resolve) => { finish = resolve; }));
  render(
    <MemoryRouter initialEntries={["/app/account/verify#token=synthetic-one-use-token"]}>
      <AnonymousWebApp />
      <Location />
    </MemoryRouter>,
  );
  // A reload or a restored tab still has the link: the token stays in the address.
  expect(screen.getByTestId("location")).toHaveTextContent("/app/account/verify#token=synthetic-one-use-token");
  expect(posts).toEqual([]);
  // The page names the account before the reader taps (a link someone else sent is not opened blind).
  const tap = await screen.findByRole("button", { name: "Log in as " + USER.email });
  expect(tap).toBeDisabled();
  expect(JSON.parse((vi.mocked(fetch).mock.calls.find(([path]) => String(path).endsWith("/link-info"))![1] as RequestInit).body as string)).toEqual({ kind: "verify", token: "synthetic-one-use-token" });
  expect(screen.getByRole("link", { name: "Log in with your own email" })).toHaveAttribute("href", "/app/account/sign-in");
  fireEvent.submit(screen.getByRole("form", { name: "Verify email" }));
  expect(posts).toEqual([]);
  await act(async () => finish(response({ status: "guest" })));
  expect(screen.getByRole("button", { name: "Log in as " + USER.email })).toBeEnabled();
  expect(screen.getByTestId("location")).toHaveTextContent("token=");
  fireEvent.click(screen.getByRole("button", { name: "Log in as " + USER.email }));
  expect(await screen.findByRole("heading", { name: "You’re signed in" })).toBeInTheDocument();
  expect(screen.getByText("Your email is confirmed and your account is ready.")).toBeInTheDocument();
  expect(screen.getByText(USER.email)).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/app\/account\/welcome$/);
  expect(posts).toEqual(["/api/account/verify-email"]);
  expect(JSON.parse((vi.mocked(fetch).mock.calls.find(([path]) => String(path).endsWith("/verify-email"))![1] as RequestInit).body as string)).toEqual({ token: "synthetic-one-use-token" });
  expect(await screen.findByRole("heading", { name: "Your reading shelf" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Go to my reading shelf" })).toHaveAttribute("href", "/");
});
it("still accepts ?token= from emails sent before the change; an expired link offers Request a new link", async () => {
  const posts: string[] = [];
  vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit = {}) => {
    if (options.method === "POST") posts.push(path);
    if (path.endsWith("/session")) return Promise.resolve(response({ status: "guest" }));
    if (path.endsWith("/link-info")) return Promise.resolve(response({ status: "valid", email: USER.email }));
    if (path.endsWith("/reset-password")) return Promise.resolve(new Response(JSON.stringify({ error: { code: "LINK_EXPIRED", message: "This link has expired or was already used." } }), { status: 400 }));
    return Promise.resolve(response({ status: "ok" }));
  }));
  render(
    <MemoryRouter initialEntries={["/app/account/reset-password?token=old-style-token"]}>
      <AnonymousWebApp />
      <Location />
    </MemoryRouter>,
  );
  const field = await screen.findByLabelText("New password", { selector: "input" });
  // No rules: one character is enough, and the eye shows what was typed.
  fireEvent.change(field, { target: { value: "x" } });
  const eye = screen.getByRole("button", { name: "Show password" });
  expect(eye).toHaveAttribute("aria-pressed", "false");
  expect(field).toHaveAttribute("type", "password");
  fireEvent.click(eye);
  expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  expect(field).toHaveAttribute("type", "text");
  await waitFor(() => expect(screen.getByRole("button", { name: "Save password" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  expect(await screen.findByText("Link expired")).toBeInTheDocument();
  expect(posts).toEqual(["/api/account/link-info", "/api/account/reset-password"]);
  fireEvent.click(screen.getByRole("link", { name: "Request a new link" }));
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/app\/account\/forgot-password$/);
  // The email the link was for comes along.
  expect(await screen.findByLabelText("Email")).toHaveValue(USER.email);
});
it("a link that no longer works shows Link expired at once, says nothing about any account and uses nothing", async () => {
  const posts: string[] = [];
  vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit = {}) => {
    if (options.method === "POST") posts.push(path);
    if (path.endsWith("/session")) return Promise.resolve(response({ status: "guest" }));
    if (path.endsWith("/link-info")) return Promise.resolve(new Response(JSON.stringify({ error: { code: "LINK_EXPIRED", message: "This link has expired or was already used." } }), { status: 400 }));
    return Promise.resolve(response({ status: "ok" }));
  }));
  render(
    <MemoryRouter initialEntries={["/app/account/magic-link#token=someone-elses-old-token"]}>
      <AnonymousWebApp />
      <Location />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Link expired")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Log in as/ })).not.toBeInTheDocument();
  expect(posts).toEqual(["/api/account/link-info"]);
});
it("the emailed log-in link signs in on one tap and lands on Welcome", async () => {
  const posts: string[] = [], gate = { open: false };
  vi.stubGlobal("fetch", signedInAfter(posts, "/magic-link/verify", gate));
  render(
    <MemoryRouter initialEntries={["/app/account/magic-link#token=synthetic-link-token"]}>
      <AnonymousWebApp />
      <Location />
    </MemoryRouter>,
  );
  const button = await screen.findByRole("button", { name: "Log in as " + USER.email });
  await waitFor(() => expect(button).toBeEnabled());
  // Opening the page spends nothing (a mail scanner cannot use the link).
  expect(posts).toEqual([]);
  fireEvent.click(button);
  expect(await screen.findByRole("heading", { name: "You’re signed in" })).toBeInTheDocument();
  expect(screen.getByText("You’re logged in on this device.")).toBeInTheDocument();
  expect(posts).toEqual(["/api/account/magic-link/verify"]);
  expect(screen.getByTestId("location")).toHaveTextContent(/^\/app\/account\/welcome$/);
});
it("opening Create account or Log in wakes the account service with one GET, once per page load", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit = {}) => {
    calls.push((options.method || "GET") + " " + path);
    return Promise.resolve(response(path.endsWith("/session") ? { status: "guest" } : path.endsWith("/capabilities") ? ready : { ok: true }));
  }));
  const { unmount } = render(
    <MemoryRouter initialEntries={["/app/account/sign-up"]}>
      <AnonymousWebApp />
    </MemoryRouter>,
  );
  await screen.findByLabelText("Email", { exact: true });
  await waitFor(() => expect(calls).toContain("GET /api/auth/ok"));
  unmount();
  render(
    <MemoryRouter initialEntries={["/app/account/sign-in"]}>
      <AnonymousWebApp />
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: "Email me a log-in link" });
  expect(calls.filter((call) => call === "GET /api/auth/ok")).toHaveLength(1);
  expect(calls.filter((call) => call.startsWith("POST"))).toEqual([]);
});
it("Log in: Email me a log-in link answers the same for any address; the password stays the second way", async () => {
  const posts: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn((path: string, options: RequestInit = {}) => {
    if (options.method === "POST") posts.push({ path, body: JSON.parse(String(options.body)) });
    if (path.endsWith("/session")) return Promise.resolve(response({ status: "guest" }));
    if (path.endsWith("/magic-link")) return Promise.resolve(new Response(JSON.stringify({ status: "check-email" }), { status: 202 }));
    return Promise.resolve(response({ ok: true }));
  }));
  render(
    <MemoryRouter initialEntries={["/app/account/sign-in"]}>
      <AnonymousWebApp />
    </MemoryRouter>,
  );
  const send = await screen.findByRole("button", { name: "Email me a log-in link" });
  await waitFor(() => expect(send).toBeEnabled());
  expect(screen.getByText("We send a link to your email. Open it on this device and you are logged in. No password needed.")).toBeInTheDocument();
  expect(screen.getByText("or use your password")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Log in with password" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/app/account/sign-up");
  fireEvent.click(send);
  expect(await screen.findByText("Check the email")).toBeInTheDocument();
  expect(posts).toEqual([]);
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), { target: { value: "reader@example.test" } });
  fireEvent.click(send);
  expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  expect(screen.getByText("If that address has an account, a link is on its way. Open it on this device and you are logged in.")).toBeInTheDocument();
  expect(posts).toEqual([{ path: "/api/account/magic-link", body: { email: "reader@example.test" } }]);
  fireEvent.click(screen.getByRole("button", { name: "Use my password instead" }));
  expect(screen.getByLabelText("Email", { exact: true })).toHaveValue("reader@example.test");
});
