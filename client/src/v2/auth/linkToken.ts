import { useLocation, type Location } from "react-router-dom";

// The pages that an account email links to.
const LINK_PAGE = /^\/app\/account\/(verify|reset-password|email-change|magic-link)$/;

export function moveLegacyLinkToken() {
  const url = new URL(window.location.href);
  if (!LINK_PAGE.test(url.pathname) || !url.searchParams.has("token")) return;
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (!fragment.has("token")) fragment.set("token", url.searchParams.get("token") || "");
  url.searchParams.delete("token");
  url.hash = fragment.toString();
  window.history.replaceState(window.history.state, "", url);
}

/**
 * The token of an emailed link (plan B4). Emails carry it after "#", which
 * never reaches a server or its logs; links sent before that carried
 * "?token=", which still works. The token stays in the address until the
 * page has used it successfully (the page then moves on with `replace`), so a
 * reload, a restored tab or a restarted browser can still use the link.
 */
export function linkTokenOf(location: Pick<Location, "pathname" | "search" | "hash">): string {
  if (!LINK_PAGE.test(location.pathname)) return "";
  const fragment = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
  return fragment || new URLSearchParams(location.search).get("token") || "";
}

export function useLinkToken(): string {
  return linkTokenOf(useLocation());
}
