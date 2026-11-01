import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AccountForm } from "./AccountPages";
afterEach(() => {
  cleanup();
  document.title = "";
});
it("preserves field focus across equivalent error rerenders and focuses a new result heading", () => {
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
  expect(screen.getByRole("alert")).toHaveFocus();
  screen.getByRole("textbox", { name: "Email" }).focus();
  rerender(content("Create account", "Check your email address."));
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();
  rerender(content("Create account", "Enter a name."));
  expect(screen.getByRole("alert")).toHaveFocus();
  rerender(content("Check your email"));
  expect(
    screen.getByRole("heading", { name: "Check your email" }),
  ).toHaveFocus();
  expect(document.title).toBe("Check your email — MyBookshelf");
});
