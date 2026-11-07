import { failure } from "./contracts.js";
import { text, attributes } from "../providers/catalogMarkup.js";
import { academicNativeProfile } from "../providers/discoveryAcademic.js";
import recipes from "./recipe-contracts.json" with { type: "json" };
import { reviewedEasylibClient } from "../providers/easylibNative.js";
import { autolibSmartMatch } from "../providers/autolibNative.js";

// Independent field/order oracle for server-rendered website variants. It
// reads displayed rows directly and does not call the provider's parser.
export function academicFidelity(
  entry,
  response,
  records,
  nativeProfile = null,
) {
  const profile = academicNativeProfile(entry);
  if (!profile.supported)
    return { verified: false, reason: "website_js_display_recipe_pending" };
  if (profile.kind === "autolib") {
    if (
      new URL(response.url).pathname !== recipes.autolib.request.path ||
      nativeProfile?.clientSha256 !== recipes.autolib.inlineCanonicalSha256 ||
      nativeProfile?.dataTablesVersion !== "1.13.5" ||
      nativeProfile?.titleColumn !== 5 ||
      nativeProfile?.pageSize !== 25 ||
      !Number.isSafeInteger(nativeProfile?.offset) ||
      nativeProfile.offset < 0 ||
      nativeProfile.offset % 25 ||
      typeof nativeProfile.query !== "string"
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Unexpected Autolib native client or page",
        502,
      );
    let data;
    try {
      data = JSON.parse(response.text);
    } catch {
      throw failure("FIDELITY_MISMATCH", "Invalid Autolib metadata JSON", 502);
    }
    if (
      !Array.isArray(data.data) ||
      data.data.some((r) => !Array.isArray(r) || r.length !== 12)
    )
      throw failure("FIDELITY_MISMATCH", "Autolib columns changed", 502);
    const expected = data.data
      .filter((r) => autolibSmartMatch(r[5], nativeProfile.query))
      .slice(nativeProfile.offset, nativeProfile.offset + 25)
      .map((r) => [text(r[2]), text(r[5]), text(r[6]), text(r[11])]);
    const observed = records.map((r) => [
      r.sourceId,
      r.title,
      (r.authors || []).join(" "),
      r.format,
    ]);
    if (JSON.stringify(expected) !== JSON.stringify(observed))
      throw failure(
        "FIDELITY_MISMATCH",
        "Autolib identities, material labels or native filtered order changed",
        502,
      );
    return {
      verified: true,
      method: "reviewed_native_autolib_title_datatables",
      recipeVersion: recipes.autolib.version,
      clientSha256: nativeProfile.clientSha256,
      nativeRows: expected.length,
      offset: nativeProfile.offset,
      pageSize: 25,
    };
  }
  if (profile.kind === "easylib") {
    if (
      new URL(response.url).pathname !== recipes.easylib.request.path ||
      !reviewedEasylibClient(nativeProfile?.clientSha256) ||
      !Number.isSafeInteger(nativeProfile?.pageSize) ||
      !Number.isSafeInteger(nativeProfile?.offset) ||
      nativeProfile.pageSize < 1 ||
      nativeProfile.offset < 0 ||
      nativeProfile.offset % nativeProfile.pageSize
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Unexpected Easylib client, request or native page",
        502,
      );
    let data;
    try {
      data = JSON.parse(response.text);
    } catch {
      throw failure(
        "FIDELITY_MISMATCH",
        "Unrecognized Easylib native JSON",
        502,
      );
    }
    if (
      !Array.isArray(data.realdata) ||
      data.search !== nativeProfile.query ||
      !Number.isSafeInteger(Number(data.recordsFiltered)) ||
      Number(data.recordsFiltered) < 0
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Easylib query echo or native rows changed",
        502,
      );
    const expected = data.realdata.map((r) => [
      String(r.Fld_Title_No),
      text(r.Fld_Title),
      text(r.Fld_Authors),
      text(r.Fld_NB_Type),
    ]);
    const observed = records.map((r) => [
      r.sourceId,
      r.title,
      (r.authors || []).join(" "),
      r.format || "",
    ]);
    if (JSON.stringify(expected) !== JSON.stringify(observed))
      throw failure(
        "FIDELITY_MISMATCH",
        "Native Easylib identities, labels or row order changed",
        502,
      );
    return {
      verified: true,
      method: "reviewed_native_easylib_keyword_client",
      recipeVersion: recipes.easylib.version,
      clientSha256: nativeProfile.clientSha256,
      nativeRows: expected.length,
      offset: nativeProfile.offset,
      pageSize: nativeProfile.pageSize,
    };
  }
  if (profile.kind === "srms") {
    const offset = nativeProfile?.offset || 0;
    if (
      new URL(response.url).pathname !== recipes.srms.request.path ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset % 10
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Unexpected native SRMS request or page",
        502,
      );
    let data;
    try {
      data = JSON.parse(response.text);
    } catch {
      throw failure("FIDELITY_MISMATCH", "Unrecognized native SRMS JSON", 502);
    }
    if (
      !Array.isArray(data) ||
      data.some(
        (row) =>
          !row ||
          typeof row.title !== "string" ||
          !Object.hasOwn(row, "author_name"),
      )
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Native SRMS bibliography columns changed",
        502,
      );
    const expected = data
      .slice(offset, offset + 10)
      .map((row) => [text(row.title), text(row.author_name)]);
    if (
      JSON.stringify(expected) !==
      JSON.stringify(
        records.map((row) => [row.title, (row.authors || []).join(" ")]),
      )
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "SRMS native title/author rows were clipped or reordered",
        502,
      );
    return {
      verified: true,
      method: "reviewed_native_srms_title_client",
      recipeVersion: recipes.srms.version,
      clientSha256: recipes.srms.clientSha256,
      nativeRows: expected.length,
      offset,
    };
  }
  const html = response.text.replace(
      /<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi,
      "",
    ),
    kind = profile.kind;
  const cells = (row) =>
    [...row.matchAll(/<td\b[^>]*>([^]*?)<\/td>/gi)].map((m) => text(m[1]));
  const rows = (body) =>
    [...body.matchAll(/<tr\b[^>]*>([^]*?)<\/tr>/gi)].map((m) => cells(m[1]));
  const tableBodies = (predicate) =>
    [...html.matchAll(/<table\b([^>]*)>/gi)]
      .filter((m) => predicate(attributes(m[1])))
      .map((open) => {
        const tags = /<\/?table\b[^>]*>/gi;
        tags.lastIndex = open.index + open[0].length;
        let depth = 1,
          tag;
        while ((tag = tags.exec(html))) {
          depth += /^<\//.test(tag[0]) ? -1 : 1;
          if (!depth) return html.slice(open.index + open[0].length, tag.index);
        }
        throw failure(
          "FIDELITY_MISMATCH",
          "Truncated native website table",
          502,
        );
      });
  const table = (id) => {
    const found = tableBodies((a) => a.id === id);
    if (found.length !== 1)
      throw failure(
        "FIDELITY_MISMATCH",
        "Missing or ambiguous native result table",
        502,
      );
    return found[0];
  };
  let expected = [],
    observed = records.map((r) => r.nativeDisplayTitle || r.title);
  const explicitEmpty =
    (kind === "processcube" && /\bTotal Books:\s*0\b/i.test(text(html))) ||
    (kind === "bmu" && /\bNo books found\./i.test(text(html))) ||
    (kind === "mizoram" && /\b0 Records Found\b/i.test(text(html)));
  if (explicitEmpty) {
    const tableId = {
      processcube: "grid_book",
      bmu: "gvBooks",
      mizoram: "DataList1",
    }[kind];
    const positiveRows =
      kind === "mizoram"
        ? /DataList1_ctl(?!00_)\d+_lblTitle/.test(html)
        : tableBodies((a) => a.id === tableId).some((body) =>
            rows(body).some(
              (cells) => cells.length === (kind === "bmu" ? 7 : 9),
            ),
          );
    if (records.length || positiveRows)
      throw failure(
        "FIDELITY_MISMATCH",
        "Website zero marker contradicts result records",
        502,
      );
    return {
      verified: true,
      method: "independent_explicit_native_empty",
      variant: kind,
      nativeRows: 0,
    };
  }
  if (kind === "rps") {
    const raw = rows(table("myTable")).filter((r) => r.length === 8);
    if (raw.some((r) => !/^\d+$/.test(r[0])))
      throw failure(
        "FIDELITY_MISMATCH",
        "Native numeric website sort changed",
        502,
      );
    expected = raw.sort((a, b) => Number(a[0]) - Number(b[0])).map((r) => r[2]);
  } else if (kind === "bmu")
    expected = rows(table("gvBooks"))
      .filter((r) => r.length === 7)
      .map((r) => r[0]);
  else if (kind === "processcube")
    expected = rows(table("grid_book"))
      .filter((r) => r.length === 9)
      .map((r) => r[1]);
  else if (kind === "libsoft")
    expected = [...html.matchAll(/<a\b([^>]*)>([^]*?)<\/a>/gi)]
      .filter(
        (m) =>
          attributes(m[1]).id === "tit1" &&
          /titledetails\.php/.test(attributes(m[1]).href || ""),
      )
      .map((m) => text(m[2]));
  else if (kind === "libaitech") {
    expected = tableBodies((a) =>
      (a.class || "").split(/\s/).includes("detail-table"),
    ).map((body) => {
      const r = [
        ...body.matchAll(
          /<tr\b[^>]*>\s*<th\b[^>]*>([^]*?)<\/th>\s*<td\b[^>]*>([^]*?)<\/td>/gi,
        ),
      ].find((r) => /^title\s*:?$/i.test(text(r[1])));
      return text(r?.[2]);
    });
  } else if (kind === "librarika") {
    expected = [
      ...html.matchAll(
        /<a\b[^>]*href=["']\/search\/detail\/(\d+)["'][^>]*>([^]*?)<\/a>/gi,
      ),
    ].map((m) => text(m[2]));
  } else if (kind === "nios")
    expected = [
      ...html.matchAll(/<p\b[^>]*id=["']Label35["'][^>]*>([^]*?)<\/p>/gi),
    ].map((m) => text(m[1]));
  else if (kind === "mizoram")
    expected = [
      ...table("DataList1").matchAll(
        /<span\b[^>]*id=["']DataList1_ctl(?!00_)\d+_lblTitle["'][^>]*>([^]*?)<\/span>/gi,
      ),
    ].map((m) => text(m[1]));
  else if (kind === "darshan") {
    expected = [
      ...html.matchAll(
        /href=["']([^"']*\/Home\/BookInformation\?[^"']+)["']/gi,
      ),
    ].map((m) =>
      new URL(m[1].replaceAll("&amp;", "&"), profile.url).searchParams.get(
        "Enc_MaterialID",
      ),
    );
    observed = records.map((r) => r.sourceId);
  }
  if (["rps", "libaitech"].includes(kind)) {
    const offset = nativeProfile?.offset || 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset % 10)
      throw failure("FIDELITY_MISMATCH", "Invalid client page offset", 502);
    expected = expected.slice(offset, offset + 10);
  }
  if (
    expected.some((v) => !v) ||
    JSON.stringify(expected) !== JSON.stringify(observed)
  )
    throw failure(
      "FIDELITY_MISMATCH",
      "Academic website rows were omitted, regrouped or reordered",
      502,
    );
  return {
    verified: true,
    method: "independent_server_html_rows",
    variant: kind,
    nativeRows: expected.length,
  };
}
