const NAME = "mybookshelf.guest-write.v1";
export const guestStorageLocksAvailable = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.locks?.request === "function";
export async function withGuestStorageLock<T>(
  work: () => T | Promise<T>,
): Promise<T> {
  if (!guestStorageLocksAvailable()) return work();
  return navigator.locks.request(NAME, { mode: "exclusive" }, work);
}
