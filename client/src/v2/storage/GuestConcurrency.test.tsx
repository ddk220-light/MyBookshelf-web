import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LibraryStateProvider, useLibrary } from "../context";
import { readAnonymousWebState } from "../localState";
import type { PublicBook } from "../types";
import {setReaderIdentityScope,writeReaderPreferences,readReaderPreferences} from '../readerState';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('preserves a guest library display summary through private bootstrap without exposing it while unknown',()=>{
 setReaderIdentityScope(null);writeReaderPreferences({selectedLibrary:{id:'bc:smcl',name:'Guest library'}});
 setReaderIdentityScope('checking');expect(readReaderPreferences().selectedLibrary).toBeUndefined();
 setReaderIdentityScope(null);expect(readReaderPreferences().selectedLibrary?.name).toBe('Guest library');
 setReaderIdentityScope('authenticated:synthetic-owner');expect(readReaderPreferences().selectedLibrary).toBeUndefined();
 setReaderIdentityScope(null);expect(readReaderPreferences().selectedLibrary).toBeUndefined();
});
function Save({ id }: { id: string }) {
  const library = useLibrary();
  return (
    <button
      onClick={() =>
        void library.saveBook({
          bookKey: "v1:googlebooks:" + id,
          title: id,
          authors: [],
        } as PublicBook)
      }
    >
      Save {id}
    </button>
  );
}
it("two guest views read the current shelf under the shared lock before writing", async () => {
  let queue = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, _options: unknown, run: () => unknown) => {
        const next = queue.then(run);
        queue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      },
    },
  });
  render(
    <>
      <LibraryStateProvider>
        <Save id="first" />
      </LibraryStateProvider>
      <LibraryStateProvider>
        <Save id="second" />
      </LibraryStateProvider>
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save first" }));
  fireEvent.click(screen.getByRole("button", { name: "Save second" }));
  await waitFor(() =>
    expect(
      readAnonymousWebState()
        .savedBooks.map((b) => b.title)
        .sort(),
    ).toEqual(["first", "second"]),
  );
});
