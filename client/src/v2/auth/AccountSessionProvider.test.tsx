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
  const { session, signOut, continueGuest } = useAccountSession();
  return (
    <>
      <span>{session.status}</span>
      <span>{session.user?.name}</span>
      <button onClick={() => void signOut()}>Sign out</button>
      <button onClick={continueGuest}>Continue as guest</button>
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
