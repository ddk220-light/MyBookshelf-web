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
  fireEvent.submit(screen.getByRole("form", { name: "Create account" }));
  expect(
    await screen.findByRole("heading", { name: "Check your email" }),
  ).toBeInTheDocument();
});
function Location() {
  const location = useLocation();
  return (
    <span data-testid="location">{location.pathname + location.search}</span>
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
    expect(screen.getByTestId("location")).toHaveTextContent("/app/shelf");
    expect(
      JSON.parse(localStorage.getItem("mybookshelf.anonymous-web.v1")!)
        .savedBooks,
    ).toEqual(JSON.parse(guest).savedBooks);
    expect(
      await screen.findByRole("link", { name: "Synthetic browser shelf by Synthetic author" }),
    ).toBeInTheDocument();
    expect(
      fetch.mock.calls.every(
        (args) =>
          (args as unknown as [string, RequestInit])[1]?.method !== "POST",
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
  fireEvent.submit(screen.getByRole("form", { name: "Create account" }));
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
  fireEvent.submit(screen.getByRole("form", { name: "Create account" }));
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
it("removes a verification token from the URL, preserves it through bootstrap and exchanges only on confirmation", async () => {
  let finish: (value: Response) => void = () => {};
  const posts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, options: RequestInit) => {
      if (path.endsWith("/session"))
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      if (options.method === "POST") posts.push(path);
      return Promise.resolve(response({ status: "verified" }));
    }),
  );
  render(
    <MemoryRouter
      initialEntries={["/app/account/verify?token=synthetic-one-use-token"]}
    >
      <AnonymousWebApp />
      <Location />
    </MemoryRouter>,
  );
  expect(screen.getByTestId("location")).toHaveTextContent(
    "/app/account/verify",
  );
  await waitFor(() =>
    expect(screen.getByTestId("location")).not.toHaveTextContent("token="),
  );
  expect(posts).toEqual([]);
  expect(screen.getByRole("button", { name: "Verify email" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("form", { name: "Verify email" }));
  expect(posts).toEqual([]);
  await act(async () => finish(response({ status: "guest" })));
  expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
  expect(
    await screen.findByRole("heading", { name: "Email verified" }),
  ).toBeInTheDocument();
  expect(posts).toEqual(["/api/account/verify-email"]);
});
