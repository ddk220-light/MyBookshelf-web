import { browserStorage, type StorageLike } from './browserStorage';

export const DOG_ANIMATION_STORAGE_KEY = 'mybookshelf.anonymous-web.dog-animation';

export function readDogAnimation(storage: StorageLike | null = browserStorage()): boolean {
  try {
    return storage?.getItem(DOG_ANIMATION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeDogAnimation(enabled: boolean, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DOG_ANIMATION_STORAGE_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}
