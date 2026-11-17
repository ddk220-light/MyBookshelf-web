import { createContext, useContext } from 'react';
import type { ReadingLight, ReadingLightPreference } from '../readingLight';

/** The reading light chosen in this browser; AppFrame provides it. */
export const ReadingLightContext = createContext<{ light: ReadingLight; preference: ReadingLightPreference; setLight: (l: ReadingLightPreference) => void }>({ light: 'daylight', preference: 'system', setLight: () => {} });

export function useReadingLight() {
  return useContext(ReadingLightContext);
}
