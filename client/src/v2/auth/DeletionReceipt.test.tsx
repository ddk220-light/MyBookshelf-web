import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  act,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { AccountSessionProvider, useAccountSession } from "./AccountSessionProvider";
import {
  DeletionReceiptProvider,
  useDeletionReceipt,
} from "./DeletionReceiptProvider";
import { DeletionStatusPage } from "../ui/account/DeletionStatusPage";
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200 });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

it("bounds automatic status checks while preserving a manual check for delayed cleanup", async () => {
  vi.useFakeTimers();
  let statusChecks = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path.endsWith("/session")) return json({ status: "guest" });
      if (path.endsWith("/deletion/status")) statusChecks++;
      return json({ status: "accepted" });
    }),
  );
  render(
    <MemoryRouter initialEntries={["/submit"]}>
      <AccountSessionProvider>
        <DeletionReceiptProvider>
          <Routes>
            <Route path="/submit" element={<Submit />} />
            <Route
              path="/app/account/deletion"
              element={<DeletionStatusPage />}
            />
          </Routes>
        </DeletionReceiptProvider>
      </AccountSessionProvider>
    </MemoryRouter>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
  });
  for (let step = 0; step < 15; step++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
  expect(statusChecks).toBe(12);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(statusChecks).toBe(12);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Check deletion status" }),
    );
  });
  expect(statusChecks).toBe(13);
});

it("does not replace a newer deletion receipt with an older account response", async () => {
  let finish!: (response: Response) => void;
  const older = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let count = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      path.endsWith("/session")
        ? json({ status: "guest" })
        : ++count === 1
          ? older
          : json({ status: "cleaned" }),
    ),
  );
  function Controls() {
    const { receipt, submit } = useDeletionReceipt();
    return (
      <>
        <button
          onClick={() =>
            void submit({
              proof: "synthetic",
              csrfToken: "synthetic",
              identity: "older",
            })
          }
        >
          Older
        </button>
        <button
          onClick={() =>
            void submit({
              proof: "synthetic",
              csrfToken: "synthetic",
              identity: "newer",
            })
          }
        >
          Newer
        </button>
        <p>{receipt?.status}</p>
      </>
    );
  }
  render(
    <MemoryRouter>
      <AccountSessionProvider>
        <DeletionReceiptProvider>
          <Controls />
        </DeletionReceiptProvider>
      </AccountSessionProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText("Older"));
  fireEvent.click(screen.getByText("Newer"));
  expect(await screen.findByText("cleaned")).toBeInTheDocument();
  await act(async () => {
    finish(json({ status: "accepted" }));
  });
  expect(screen.getByText("cleaned")).toBeInTheDocument();
});
function Submit() {
  const receipt = useDeletionReceipt(),
    navigate = useNavigate();
  return (
    <button
      onClick={() => {
        void receipt.submit({
          proof: "synthetic-proof",
          csrfToken: "synthetic-csrf",
          identity: "synthetic-owner",
        });
        navigate("/app/account/deletion");
      }}
    >
      Confirm deletion
    </button>
  );
}
it("keeps the nonce only in memory and checks a lost response without submitting another deletion", async () => {
  const posts: Array<{ path: string; body: Record<string, unknown> }> = [];
  let cleaned = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options: RequestInit) => {
      if (path.endsWith("/session"))
        return json({
          status: "authenticated",
          csrfToken: "synthetic-csrf",
          user: {
            id: "synthetic-owner",
            name: "Private reader",
            email: "private@example.test",
            emailVerified: true,
          },
        });
      const body = JSON.parse(String(options.body));
      posts.push({ path, body });
      if (path.endsWith("/deletion")) throw Error("Synthetic lost response");
      return json({
        status: cleaned ? "cleaned" : "accepted",
        accessEnded: true,
        cleanupComplete: cleaned,
      });
    }),
  );
  render(
    <MemoryRouter initialEntries={["/submit"]}>
      <AccountSessionProvider>
        <DeletionReceiptProvider>
          <Routes>
            <Route path="/submit" element={<Submit />} />
            <Route
              path="/app/account/deletion"
              element={<DeletionStatusPage />}
            />
          </Routes>
        </DeletionReceiptProvider>
      </AccountSessionProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t confirm the response",
  );
  const nonce = String(posts[0].body.receiptNonce);
  expect(nonce).toHaveLength(43);
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(
    nonce,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Check deletion status" }),
  );
  await waitFor(() =>
    expect(
      screen.getByText(/Your deletion request is durably recorded/),
    ).toBeInTheDocument(),
  );
  expect(posts.filter((p) => p.path.endsWith("/deletion"))).toHaveLength(1);
  expect(posts[1].body).toEqual({
    operationId: posts[0].body.operationId,
    receiptNonce: nonce,
  });
  cleaned = true;
  fireEvent.click(
    screen.getByRole("button", { name: "Check deletion status" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Account cleanup complete" }),
  ).toBeInTheDocument();
  expect(posts.filter((p) => p.path.endsWith("/deletion"))).toHaveLength(1);
});

const authenticated = (id = "synthetic-owner") => ({
  status: "authenticated", csrfToken: "synthetic-csrf",
  user: { id, name: "Synthetic reader", email: "reader@example.test", emailVerified: true },
});
function DeletionControls() {
  const account = useAccountSession(), deletion = useDeletionReceipt();
  return <>
    <output data-testid="session">{JSON.stringify(account.session)}</output>
    <output data-testid="receipt">{deletion.receipt?.status}</output>
    <button onClick={() => void deletion.submit({identity: "synthetic-owner", proof: "synthetic", csrfToken: "synthetic"})}>Delete owner</button>
    <button onClick={() => void deletion.check()}>Check receipt</button>
    <button onClick={account.prepareSignIn}>Begin another sign-in</button>
    <button onClick={() => void account.refresh(true)}>Finish another sign-in</button>
    <button onClick={account.continueGuest}>Use guest</button>
    <button onClick={() => void account.refresh()}>Refresh session</button>
  </>;
}
function renderDeletionControls() {
  render(<AccountSessionProvider><DeletionReceiptProvider><DeletionControls/></DeletionReceiptProvider></AccountSessionProvider>);
}
const readSession = () => JSON.parse(screen.getByTestId("session").textContent!);

it("ends access without an unconfirmed sign-out warning after acknowledged deletion", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => json(path.endsWith("/session")
    ? authenticated() : {status: "accepted", accessEnded: true})));
  renderDeletionControls();
  await waitFor(() => expect(readSession().status).toBe("authenticated"));
  fireEvent.click(screen.getByRole("button", {name: "Delete owner"}));
  await waitFor(() => expect(screen.getByTestId("receipt")).toHaveTextContent("accepted"));
  expect(readSession()).toMatchObject({status: "guest"});
  expect(readSession().logoutPending).not.toBe(true);
  expect(readSession().sessionEnded).not.toBe(true);
  expect(localStorage.getItem("mybookshelf.local-guest-override.v1")).toBeNull();
});

it("keeps lost-response protection until the same deletion receipt confirms access ended", async () => {
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path.endsWith("/session")) return json(authenticated());
    if (path.endsWith("/deletion")) throw Error("Synthetic lost response");
    return json({status: "accepted", accessEnded: true});
  }));
  renderDeletionControls();
  await waitFor(() => expect(readSession().status).toBe("authenticated"));
  fireEvent.click(screen.getByRole("button", {name: "Delete owner"}));
  await waitFor(() => expect(readSession()).toMatchObject({status: "guest", logoutPending: true}));
  expect(localStorage.getItem("mybookshelf.local-guest-override.v1")).toBe("true");
  fireEvent.click(screen.getByRole("button", {name: "Check receipt"}));
  await waitFor(() => expect(screen.getByTestId("receipt")).toHaveTextContent("accepted"));
  expect(readSession().logoutPending).not.toBe(true);
  expect(readSession().sessionEnded).not.toBe(true);
  expect(localStorage.getItem("mybookshelf.local-guest-override.v1")).toBeNull();
});

it("does not interrupt a newer sign-in intent with a late deletion acknowledgement", async () => {
  let finish!: (response: Response) => void;
  const response = new Promise<Response>(resolve => {finish = resolve;});
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path.endsWith("/session") ? json(authenticated()) : response));
  renderDeletionControls();
  await waitFor(() => expect(readSession().status).toBe("authenticated"));
  fireEvent.click(screen.getByRole("button", {name: "Delete owner"}));
  fireEvent.click(screen.getByRole("button", {name: "Begin another sign-in"}));
  await act(async () => {finish(json({status: "accepted", accessEnded: true}));});
  expect(readSession()).toMatchObject({status: "authenticated", user: {id: "synthetic-owner"}});
});

it("does not clear a newer identity's privacy lock when an older receipt is confirmed", async () => {
  let identity = "synthetic-owner";
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path.endsWith("/session")) return json(authenticated(identity));
    if (path.endsWith("/deletion")) throw Error("Synthetic lost response");
    return json({status: "accepted", accessEnded: true});
  }));
  renderDeletionControls();
  await waitFor(() => expect(readSession().status).toBe("authenticated"));
  fireEvent.click(screen.getByRole("button", {name: "Delete owner"}));
  await waitFor(() => expect(readSession().logoutPending).toBe(true));
  identity = "newer-owner";
  fireEvent.click(screen.getByRole("button", {name: "Finish another sign-in"}));
  await waitFor(() => expect(readSession().user?.id).toBe("newer-owner"));
  fireEvent.click(screen.getByRole("button", {name: "Use guest"}));
  fireEvent.click(screen.getByRole("button", {name: "Check receipt"}));
  await waitFor(() => expect(screen.getByTestId("receipt")).toHaveTextContent("accepted"));
  expect(readSession()).toMatchObject({status: "guest", logoutPending: true});
  expect(localStorage.getItem("mybookshelf.local-guest-override.v1")).toBe("true");
});

it("rejects a late deletion response after automatic identity changes even if the original user returns", async () => {
  let identity = "synthetic-owner", finish!: (response: Response) => void;
  const response = new Promise<Response>(resolve => {finish = resolve;});
  vi.stubGlobal("fetch", vi.fn(async (path: string) => path.endsWith("/session") ? json(authenticated(identity)) : response));
  renderDeletionControls();
  await waitFor(() => expect(readSession().status).toBe("authenticated"));
  fireEvent.click(screen.getByRole("button", {name: "Delete owner"}));
  identity = "another-owner";
  fireEvent.click(screen.getByRole("button", {name: "Refresh session"}));
  await waitFor(() => expect(readSession().user?.id).toBe(identity));
  identity = "synthetic-owner";
  fireEvent.click(screen.getByRole("button", {name: "Refresh session"}));
  await waitFor(() => expect(readSession().user?.id).toBe(identity));
  await act(async () => {finish(json({status: "accepted", accessEnded: true}));});
  expect(readSession()).toMatchObject({status: "authenticated", user: {id: identity}});
});
