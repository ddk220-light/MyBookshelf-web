import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AccountForm } from "./AccountPages";
afterEach(() => {
  cleanup();
  document.title = "";
});
// The error is announced (role="alert"); focus stays where the reader is.
it("keeps field focus across error rerenders and focuses a new result heading", () => {
  const content = (title: string, message?: string) => (
    <MemoryRouter>
      <AccountForm
        title={title}
        error={message ? <strong>{message}</strong> : undefined}
      >
        <label>
          Email
          <input name="email" />
        </label>
      </AccountForm>
    </MemoryRouter>
  );
  const { rerender } = render(
    content("Create account", "Check your email address."),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Check your email address.");
  screen.getByRole("textbox", { name: "Email" }).focus();
  rerender(content("Create account", "Check your email address."));
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();
  rerender(content("Create account", "Enter a name."));
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();
  rerender(content("Check your email"));
  expect(
    screen.getByRole("heading", { name: "Check your email" }),
  ).toHaveFocus();
  expect(document.title).toBe("Check your email — MyBookshelf");
});
