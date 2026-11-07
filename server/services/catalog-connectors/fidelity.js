import { failure } from "./contracts.js";

// Deliberately independent of provider parsers: compare raw link identities
// with the adapter's native page, without ranking or title matching.
export function verifyNativePage(family, responses, records) {
  if (!["koha", "egranthalaya", "indcat", "vufind"].includes(family))
    return { verified: false, reason: "website_display_recipe_pending" };
  const response = [...responses]
    .reverse()
    .find((r) => r.status === 200 && !r.url.endsWith("/robots.txt"));
  if (!response) return { verified: false, reason: "no_native_page" };
  const html = response.text
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, "");
  let ids = [];
  if (family === "koha") {
    for (const m of html.matchAll(/<a\b([^>]*)>[^]*?<\/a>/gi))
      if (/class\s*=\s*["'][^"']*\btitle\b/i.test(m[1])) {
        const id = m[1].match(/biblionumber=(\d+)/)?.[1];
        if (id) ids.push(id);
      }
  } else if (family === "egranthalaya") {
    for (const m of html.matchAll(/<a\b([^>]*)>/gi))
      if (/Repeater1_lnkDetails3_\d+/.test(m[1])) {
        const id = m[1].match(/showValues\((\d+),\s*false\)/)?.[1];
        if (id) ids.push(id);
      }
  } else if (family === "indcat") {
    for (const m of html.matchAll(
      /href\s*=\s*["']([^"']*\/search\/book_search\?[^"']+)["']/gi,
    )) {
      try {
        const data = JSON.parse(
          Buffer.from(
            new URL(
              m[1].replaceAll("&amp;", "&"),
              response.url,
            ).searchParams.get("getDetails"),
            "base64",
          ),
        );
        if (data.book_detail) ids.push(String(data.book_detail));
      } catch {
        throw failure(
          "FIDELITY_MISMATCH",
          "Unrecognized native result identity",
          502,
        );
      }
    }
  } else {
    for (const m of html.matchAll(/<a\b([^>]*)>/gi))
      if (/class\s*=\s*["'][^"']*\bgetFull\b/i.test(m[1])) {
        const id = m[1].match(/\/Record\/([^"'?#\s]+)/)?.[1];
        if (id) ids.push(decodeURIComponent(id));
      }
  }
  ids = [...new Set(ids)];
  if (!ids.length && records.length)
    return {
      verified: false,
      reason: "single_record_or_unrecognized_native_links",
    };
  if (
    JSON.stringify(ids) !==
    JSON.stringify(records.map((r) => String(r.recordId)))
  )
    throw failure(
      "FIDELITY_MISMATCH",
      "Adapter omitted or reordered native result IDs",
      502,
    );
  return {
    verified: true,
    method: "independent_native_link_order",
    nativeIds: ids,
  };
}
