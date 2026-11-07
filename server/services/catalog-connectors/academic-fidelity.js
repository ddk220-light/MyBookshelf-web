import { failure } from "./contracts.js";
import { text, attributes } from "../providers/catalogMarkup.js";
import { academicNativeProfile } from "../providers/discoveryAcademic.js";

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
