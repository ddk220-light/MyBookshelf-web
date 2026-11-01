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
        : Promise.resolve(response({ status: "check-email" })),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/app/account/sign-up"]}>
      <AnonymousWebApp />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Your name", { exact: true }), {
    target: { value: "Typed private reader" },
  });
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
    target: { value: "synthetic@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "a long synthetic test password" },
  });
  await act(async () => finish(response({ status: "guest" })));
  expect(screen.getByLabelText("Your name", { exact: true })).toHaveValue(
    "Typed private reader",
  );
  expect(screen.getByLabelText("Email", { exact: true })).toHaveValue(
    "synthetic@example.test",
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
  await act(async () => finish(response({ status: "guest" })));
  fireEvent.click(
    screen.getByRole("button", { name: "Verify email" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Email verified" }),
  ).toBeInTheDocument();
  expect(posts).toEqual(["/api/account/verify-email"]);
});
