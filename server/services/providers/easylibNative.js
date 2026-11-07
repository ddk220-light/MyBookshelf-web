import { createHash } from "node:crypto";
import { attributes, catalogError } from "./catalogMarkup.js";
import recipes from "../catalog-connectors/recipe-contracts.json" with { type: "json" };

// The reviewed page contains duplicate IDs; jQuery's #id lookup selects first.
export function easylibPageSize(html) {
  const select = [
    ...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi),
  ].find((m) => attributes(m[1]).id === "dropDownOfRowsPerPage");
  if (!select)
    throw catalogError(
      "Missing native Easylib page-size control",
      "EQUIVALENCE_UNPROVEN",
    );
  const options = [...select[2].matchAll(/<option\b([^>]*)>/gi)].map((m) =>
    attributes(m[1]),
  );
  const selected = options.filter((a) => Object.hasOwn(a, "selected"));
  const value = (selected[0] || options[0])?.value;
  if (
    selected.length > 1 ||
    !/^\d+$/.test(value || "") ||
    Number(value) < 1 ||
    Number(value) > 100
  )
    throw catalogError(
      "Unreviewed native Easylib page-size default",
      "EQUIVALENCE_UNPROVEN",
    );
  return Number(value);
}

export async function fetchNativeEasylib(c, query, read, offset = 0) {
  const pageUrl = new URL("/index.php/OpacController/searchResultPage", c.url);
  pageUrl.searchParams.set("search", query);
  const page = await read(pageUrl);
  if (new URL(page.url).pathname !== pageUrl.pathname)
    throw catalogError("Easylib result page changed", "EQUIVALENCE_UNPROVEN");
  const pageSize = easylibPageSize(page.text);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % pageSize)
    throw catalogError(
      "Native Easylib page does not match its offered default",
      "UNSUPPORTED_PROFILE",
    );
  const scripts = [...page.text.matchAll(/<script\b([^>]*)>/gi)]
    .map((m) => attributes(m[1]).src)
    .filter(Boolean)
    .map((src) => new URL(src, pageUrl));
  const clientUrl = scripts.find(
    (url) =>
      url.origin === pageUrl.origin &&
      url.pathname === recipes.easylib.clientPath,
  );
  if (!clientUrl)
    throw catalogError(
      "Native Easylib result client requires review",
      "EQUIVALENCE_UNPROVEN",
    );
  const client = await read(clientUrl);
  const clientSha256 = createHash("sha256").update(client.text).digest("hex");
  if (clientSha256 !== recipes.easylib.clientSha256)
    throw catalogError(
      "Easylib client version changed; review its public request/display contract",
      "EQUIVALENCE_UNPROVEN",
    );
  const url = new URL(recipes.easylib.request.path, c.url);
  // jQuery omits the seven empty filter arrays; a JSON string named object is
  // a different request and cannot stand in for the unfiltered website default.
  const body = new URLSearchParams({
    search: query,
    pageId: String(offset / pageSize + 1),
    start: String(offset),
    length: String(pageSize),
  });
  const response = await read(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });
  let payload;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw catalogError("Native Easylib search did not return JSON");
  }
  return {
    payload,
    nativePage: { offset, pageSize, serverPaging: true, query, clientSha256 },
  };
}
