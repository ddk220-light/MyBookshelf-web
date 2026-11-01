import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  AccountSessionProvider,
  useAccountSession,
} from "./AccountSessionProvider";
function Probe() {
  const { session, signOut, continueGuest, refresh, invalidate } =
    useAccountSession();
  return (
    <>
      <span>{session.status}</span>
      <span>{session.user?.name}</span>
      {session.sessionEnded && <span>Session ended</span>}
      <button onClick={() => void signOut()}>Sign out</button>
      <button onClick={continueGuest}>Continue as guest</button>
      <button onClick={() => void refresh(true)}>Explicit sign in</button>
      <button onClick={invalidate}>Recheck expired session</button>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});
it("bootstraps under StrictMode, hides private text on uncertain signout and persists only a guest flag", async () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path.endsWith("/sign-out")) throw Error("offline");
      return new Response(
        JSON.stringify({
          status: "authenticated",
          user: {
            id: "test-a",
            name: "Private name",
            email: "private@example.test",
            emailVerified: true,
          },
          csrfToken: "synthetic-csrf",
        }),
        { status: 200 },
      );
    }),
  );
  render(
    <StrictMode>
      <AccountSessionProvider>
        <Probe />
      </AccountSessionProvider>
    </StrictMode>,
  );
  expect(await screen.findByText("Private name")).toBeInTheDocument();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Sign out" })),
  );
  await waitFor(() =>
    expect(screen.getByText("signout-unconfirmed")).toBeInTheDocument(),
  );
  expect(screen.queryByText("Private name")).not.toBeInTheDocument();
  expect(localStorage.getItem("mybookshelf.local-guest-override.v1")).toBe(
    "true",
  );
  expect(JSON.stringify(localStorage)).not.toContain("private@example.test");
  fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));
  expect(screen.getByText("guest")).toBeInTheDocument();
});

it("ignores its own cross-tab notification after explicit sign-in", async () => {
  const channels = new Set<TestChannel>();
  class TestChannel {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    constructor(public name: string) {
      channels.add(this);
    }
    postMessage(data: unknown) {
      for (const other of channels)
        if (other !== this && other.name === this.name)
          queueMicrotask(() => other.onmessage?.({ data }));
    }
    close() {
      channels.delete(this);
    }
  }
  vi.stubGlobal("BroadcastChannel", TestChannel);
  const transport = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          status: "authenticated",
          user: {
            id: "test-a",
            name: "Private name",
            email: "a@example.test",
            emailVerified: true,
          },
          csrfToken: "test-csrf",
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", transport);
  render(
    <AccountSessionProvider>
      <Probe />
    </AccountSessionProvider>,
  );
  await screen.findByText("Private name");
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Explicit sign in" })),
  );
  expect(screen.getByText("authenticated")).toBeInTheDocument();
  expect(transport).toHaveBeenCalledTimes(2);
});

it("retains the expiry explanation when a private 401 first makes identity uncertain", async () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  let authenticated = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            authenticated
              ? {
                  status: "authenticated",
                  user: {
                    id: "test-a",
                    name: "Private name",
                    email: "a@example.test",
                    emailVerified: true,
                  },
                  csrfToken: "test-csrf",
                }
              : { status: "guest" },
          ),
          { status: 200 },
        ),
    ),
  );
  render(
    <AccountSessionProvider>
      <Probe />
    </AccountSessionProvider>,
  );
  await screen.findByText("Private name");
  authenticated = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Recheck expired session" }),
  );
  expect(await screen.findByText("Session ended")).toBeInTheDocument();
  expect(screen.queryByText("Private name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));
  expect(screen.queryByText("Session ended")).not.toBeInTheDocument();
});
