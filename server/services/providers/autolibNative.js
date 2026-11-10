import { createHash } from "node:crypto";
import { decodeHTML as decode } from "entities";
import { attributes, catalogError, text } from "./catalogMarkup.js";
import recipes from "../catalog-connectors/recipe-contracts.json" with { type: "json" };

// DataTables 1.13.5's default string search strips markup, decodes entities and
// replaces raw line separators with spaces, then removes decoded separators.
// It does not normalize accents or punctuation.
export function autolibFilterText(value) {
  return decode(
    String(value ?? "")
      .replace(/[\r\n\u2028]/g, " ")
      .replace(/<[^>]*>/g, ""),
  ).replace(/[\r\n\u2028]/g, "");
}
export function autolibSmartMatch(value, query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const words = (
    escaped.match(/["\u201C][^"\u201D]+["\u201D]|[^ ]+/g) || [""]
  ).map((word) => {
    if (word.startsWith('"')) word = word.match(/^"(.*)"$/)?.[1] ?? word;
    else if (word.startsWith("“"))
      word = word.match(/^\u201C(.*)\u201D$/)?.[1] ?? word;
    return word.replace('"', "");
  });
  return new RegExp("^(?=.*?" + words.join(")(?=.*?") + ").*$", "i").test(
    autolibFilterText(value),
  );
}
export function autolibContract(html, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const headers = html.match(
    /<table\b[^>]*id=["']datatable-responsive["'][^>]*>([\s\S]*?)<\/thead>/i,
  )?.[1];
  const labels = [
    ...(headers || "").matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi),
  ].map((m) => text(m[1]));
  if (JSON.stringify(labels) !== JSON.stringify(recipes.autolib.columns))
    throw catalogError(
      "Autolib native column contract requires review",
      "EQUIVALENCE_UNPROVEN",
    );
  const clients = [
    ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi),
  ].filter((m) => /getallbook/.test(m[1]));
  if (clients.length !== 1)
    throw catalogError(
      "Autolib native search client requires review",
      "EQUIVALENCE_UNPROVEN",
    );
  const canonical = clients[0][1]
    .replaceAll(origin, "CATALOG_ORIGIN")
    .replace(/\r\n/g, "\n")
    .trim();
  const clientSha256 = createHash("sha256").update(canonical).digest("hex");
  const libraries = [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map((m) => attributes(m[1]).src)
    .filter(Boolean)
    .map((src) => new URL(src, pageUrl).toString());
  if (
    clientSha256 !== recipes.autolib.inlineCanonicalSha256 ||
    !libraries.includes(recipes.autolib.dataTablesUrl)
  )
    throw catalogError(
      "Autolib request/display client changed; review before querying",
      "EQUIVALENCE_UNPROVEN",
    );
  return {
    clientSha256,
    pageSize: 25,
    titleColumn: 5,
    dataTablesVersion: "1.13.5",
  };
}
export async function fetchNativeAutolib(c, read) {
  // The configured historical double slash returns 404 on the reviewed site.
  const pageUrl = new URL("/index.php/booksearch", c.url);
  const page = await read(pageUrl);
  if (new URL(page.url).pathname !== pageUrl.pathname)
    throw catalogError(
      "Autolib canonical search page changed",
      "EQUIVALENCE_UNPROVEN",
    );
  const contract = autolibContract(page.text, pageUrl);
  const exportUrl = new URL("/index.php/Booksearch/getallbook", c.url);
  if (exportUrl.toString() !== c.exportUrl)
    throw catalogError(
      "Unreviewed Autolib export route",
      "EQUIVALENCE_UNPROVEN",
    );
  const response = await read(exportUrl);
  let payload;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw catalogError("Autolib public metadata response is not JSON");
  }
  return { payload, contract };
}
