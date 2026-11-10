import { failure } from "./contracts.js";
import recipes from "./recipe-contracts.json" with { type: "json" };
import { text, attributes } from "../providers/catalogMarkup.js";
import { academicFidelity } from "./academic-fidelity.js";
import { communityFidelity } from "./community-fidelity.js";
import { catalogFidelity } from "./catalog-fidelity.js";

// Deliberately independent of provider parsers: compare raw link identities
// with the adapter's native page, without ranking or title matching.
export function verifyNativePage(
  family,
  responses,
  records,
  entry = null,
  nativeProfile = null,
) {
  if (
    ![
      "koha",
      "egranthalaya",
      "indcat",
      "vufind",
      "libman",
      "vpl",
      "discovery-academic",
      "discovery-community",
      "catalog",
    ].includes(family)
  )
    return { verified: false, reason: "website_display_recipe_pending" };
  if (family === "catalog")
    return entry
      ? catalogFidelity(entry, responses, records, nativeProfile)
      : { verified: false, reason: "missing_native_catalog_variant" };
  if (family === "koha" && records.length === 1) {
    const redirect = [...responses]
      .reverse()
      .find(
        (r) =>
          r.status === 302 &&
          r.location &&
          new URL(r.url).pathname === "/cgi-bin/koha/opac-search.pl",
      );
    if (redirect) {
      const target = new URL(redirect.location, redirect.url),
        origin = new URL(redirect.url).origin;
      if (
        target.origin === origin &&
        !target.username &&
        !target.password &&
        target.pathname === "/cgi-bin/koha/opac-detail.pl" &&
        target.searchParams.getAll("biblionumber").length === 1 &&
        target.searchParams.get("biblionumber") === String(records[0].recordId)
      )
        return {
          verified: true,
          method: "native_single_record_http_redirect",
          nativeIds: [String(records[0].recordId)],
        };
    }
  }
  const response = [...responses]
    .reverse()
    .find((r) => r.status === 200 && !r.url.endsWith("/robots.txt"));
  if (!response) return { verified: false, reason: "no_native_page" };
  if (family === "discovery-academic")
    return entry
      ? academicFidelity(entry, response, records, nativeProfile)
      : { verified: false, reason: "missing_website_variant" };
  if (family === "discovery-community")
    return entry
      ? communityFidelity(entry, response, records, nativeProfile)
      : { verified: false, reason: "missing_website_variant" };
  if (family === "vpl") {
    const url = new URL(response.url);
    if (
      !/^\/books\/?$/.test(url.pathname) ||
      url.searchParams.get("author") ||
      url.searchParams.get("subject")
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Unexpected website title-search profile",
        502,
      );
    const bodies = [
      ...response.text.matchAll(/<tbody\b[^>]*>([^]*?)<\/tbody>/gi),
    ];
    if (bodies.length !== 1)
      throw failure(
        "FIDELITY_MISMATCH",
        "Missing native catalog table body",
        502,
      );
    const expected = [...bodies[0][1].matchAll(/<tr\b[^>]*>([^]*?)<\/tr>/gi)]
      .map((row) =>
        [...row[1].matchAll(/<td\b[^>]*>([^]*?)<\/td>/gi)].map((cell) =>
          text(cell[1]),
        ),
      )
      .filter((cells) => cells.length === 6)
      .map((cells) => [cells[1], cells[3]]);
    if (
      JSON.stringify(expected) !==
      JSON.stringify(records.map((r) => [r.title, r.authors?.[0] || ""]))
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Website book rows omitted or reordered",
        502,
      );
    return {
      verified: true,
      method: "independent_native_title_author_table_order",
      nativeRows: expected.length,
    };
  }
  if (family === "libman") {
    if (new URL(response.url).pathname !== recipes.libman.request.path)
      throw failure(
        "FIDELITY_MISMATCH",
        "Unexpected LIBMAN website request",
        502,
      );
    let raw;
    try {
      raw = JSON.parse(response.text);
    } catch {
      throw failure(
        "FIDELITY_MISMATCH",
        "Unrecognized LIBMAN website JSON",
        502,
      );
    }
    if (raw !== 0 && !Array.isArray(raw))
      throw failure(
        "FIDELITY_MISMATCH",
        "Unrecognized LIBMAN website results",
        502,
      );
    const ids = raw === 0 ? [] : raw.map((row) => String(row.TitleNo));
    if (
      ids.some((id) => !/^\d+$/.test(id)) ||
      JSON.stringify(ids) !==
        JSON.stringify(records.map((r) => String(r.recordId)))
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "LIBMAN native rows were omitted or reordered",
        502,
      );
    return {
      verified: true,
      method: "reviewed_website_json_client_order",
      recipeVersion: recipes.libman.version,
      clientSha256: recipes.libman.clientSha256,
      nativeIds: ids,
    };
  }
  const html = response.text
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, "");
  let ids = [];
  const missingTitleIds = new Set();
  if (family === "koha") {
    for (const m of html.matchAll(/<a\b([^>]*)>[^]*?<\/a>/gi))
      if (/class\s*=\s*["'][^"']*\btitle\b/i.test(m[1])) {
        const id = m[1].match(/biblionumber=(\d+)/)?.[1];
        if (id) {
          ids.push(id);
          if (!text(m[0].replace(/^<a\b[^>]*>|<\/a>$/gi, "")))
            missingTitleIds.add(id);
          else missingTitleIds.delete(id);
        }
      }
  } else if (family === "egranthalaya") {
    for (const m of html.matchAll(/<a\b([^>]*)>/gi))
      if (/Repeater1_lnkDetails3_\d+/.test(m[1])) {
        const id = m[1].match(/showValues\((\d+),\s*false\)/)?.[1];
        if (id) ids.push(id);
      }
  } else if (family === "indcat") {
    if (nativeProfile?.field === "title") {
      const select = [
        ...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi),
      ].find((m) => attributes(m[1]).name === "field");
      const selected = [...(select?.[2] || "").matchAll(/<option\b([^>]*)>/gi)]
        .map((m) => attributes(m[1]))
        .filter((a) => Object.hasOwn(a, "selected"));
      const inputs = [...html.matchAll(/<input\b([^>]*)>/gi)].map((m) =>
        attributes(m[1]),
      );
      if (
        selected.length !== 1 ||
        selected[0].value !== "title" ||
        inputs.find((a) => a.name === "title")?.value !== nativeProfile.query ||
        inputs.find((a) => a.name === "part_uni")?.value !==
          entry?.indcatInstitutionCode
      )
        throw failure(
          "FIDELITY_MISMATCH",
          "IndCat native field, literal query or institution scope changed",
          502,
        );
    }
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
  if (
    family === "koha" &&
    records.some(
      (r) =>
        r.title === "" &&
        (!missingTitleIds.has(String(r.recordId)) ||
          !r.metadataWarnings?.includes("missing_title")),
    )
  )
    throw failure(
      "FIDELITY_MISMATCH",
      "Untitled row was not demonstrated in the native result page",
      502,
    );
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
