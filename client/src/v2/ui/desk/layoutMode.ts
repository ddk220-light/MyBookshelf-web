import { createContext, useContext } from 'react';
import { useMediaQuery } from '../../useMediaQuery';

/**
 * Three layouts (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md, Part 1):
 * - phone, below 640 px: the one-shelf phone layout as released (640 px is
 *   where reader.css already stops drawing pop-ups as bottom sheets);
 * - rail, 640–1099 px: an icon rail on the left, and a book or side page
 *   covers the shelf;
 * - wide, 1100 px and wider: the permanent left column (DeskShelf board), and
 *   a book or side page opens in a middle slot that pushes the shelf right.
 */
export type LayoutMode = 'phone' | 'rail' | 'wide';
export const RAIL_MIN_WIDTH = 640;
export const WIDE_MIN_WIDTH = 1100;

export function useLayoutMode(): LayoutMode {
  const rail = useMediaQuery(`(min-width: ${RAIL_MIN_WIDTH}px)`);
  const wide = useMediaQuery(`(min-width: ${WIDE_MIN_WIDTH}px)`);
  return wide ? 'wide' : rail ? 'rail' : 'phone';
}

/** The account forms run without the shelf (App.tsx "entry mode"). */
export const ACCOUNT_ENTRY_PATH = /^\/app\/account\/(sign-in|sign-up|verify|forgot-password|reset-password|email-change|return|complete-profile|deletion)$/;

/**
 * Pages that open in the middle slot at rail and wide widths, with the shelf
 * beside them: a book, Account settings, Report a problem, Privacy, Terms,
 * About and the account forms. The older full account settings
 * (/app/settings/account/more) stay a page of their own.
 */
const SLOT_PAGE = /^\/app\/(books\/[^/]+|report|privacy|terms|about|settings\/account|account\/[a-z-]+)$/;

export function isSlotPath(pathname: string): boolean {
  return SLOT_PAGE.test(pathname);
}

/** Paths drawn by the desk layout (rail and wide): the shelf and every slot page. */
export function isDeskPath(pathname: string): boolean {
  return pathname === '/app/shelf' || isSlotPath(pathname);
}

/**
 * Set by the desk layout around the middle slot. Pages inside it show a
 * close button (×) at the top right instead of "‹ Back", and leave the
 * library pop-up to the layout.
 */
export type DeskSlot = { mode: Exclude<LayoutMode, 'phone'>; close: () => void };
export const DeskSlotContext = createContext<DeskSlot | null>(null);
export function useDeskSlot(): DeskSlot | null {
  return useContext(DeskSlotContext);
}
