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
import { AccountSessionProvider } from "./AccountSessionProvider";
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
