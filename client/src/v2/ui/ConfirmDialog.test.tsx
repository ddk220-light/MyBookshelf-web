import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
afterEach(cleanup);
it("keeps a destructive confirmation open while its request is pending and focuses a recoverable error", async () => {
  let fail!: (error: Error) => void;
  const request = new Promise<void>((_, reject) => {
      fail = reject;
    }),
    cancel = vi.fn(),
    confirm = vi.fn(() => request);
  render(
    <ConfirmDialog
      open
      title="Clear recent books?"
      body="This removes your recent books."
      confirmLabel="Clear recent books"
      onConfirm={confirm}
      onCancel={cancel}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear recent books" }));
  expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(cancel).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledTimes(1);
  await act(async () => {
    fail(Error("Synthetic network failure"));
  });
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(
    screen.getByRole("button", { name: "Clear recent books" }),
  ).toBeEnabled();
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(cancel).toHaveBeenCalledTimes(1);
});
