import { failure } from "./contracts.js";
import { attributes, text } from "../providers/catalogMarkup.js";
import { parseReplayId } from "../providers/communityRecords.js";
import { communityNativeProfile } from "../providers/discoveryCommunity.js";

export function communityFidelity(entry, response, records, nativeProfile) {
  const profile = communityNativeProfile(entry);
  if (!profile.supported)
    return { verified: false, reason: "website_display_contract_pending" };
  if (profile.kind === "surat") {
    const url = new URL(response.url),
      p = url.searchParams;
    if (
      url.origin !== "https://office.suratmunicipal.org" ||
      url.pathname !== "/LMS/Home/GetSearchData" ||
      p.get("CustomData[LibraryId]") !== entry.communityCatalog.scope ||
      p.get("CustomData[SearchType]") !== "BookName" ||
      p.get("CustomData[SearchBy]") !== nativeProfile?.query ||
      p.get("start") !== String(nativeProfile?.offset) ||
      p.get("length") !== "10" ||
      p.get("order[0][column]") !== "1" ||
      p.get("order[0][dir]") !== "asc" ||
      p.get("CustomData[bookCLSVal]") !== ""
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Municipal native search/page controls changed",
        502,
      );
    let data;
    try {
      data = JSON.parse(response.text);
    } catch {
      throw failure("FIDELITY_MISMATCH", "Municipal native JSON missing", 502);
    }
    const expected = data.data?.map((row) => [
      String(row.LibraryId),
      `s1_${row.BookCode}_${row.BookId}`,
      text(row.BookName),
      row.AuthorName ? [text(row.AuthorName)] : [],
    ]);
    const observed = records.map((row) => [
      entry.communityCatalog.scope,
      row.recordId,
      row.title,
      row.authors,
    ]);
    if (
      data.status !== 200 ||
      JSON.stringify(expected) !== JSON.stringify(observed)
    )
      throw failure(
        "FIDELITY_MISMATCH",
        "Municipal native copy rows were omitted, changed or reordered",
        502,
      );
    return {
      verified: true,
      method: "primary_client_datatables_copy_row_order",
      variant: "surat",
      nativeRows: expected.length,
      materialTypeProved: false,
      totalUnit: "copy_rows",
    };
  }
  const html = response.text.replace(
    /<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi,
    "",
  );
  let expected, observed;
  if (profile.kind === "pmb") {
    expected = [...html.matchAll(/<div\b([^>]*)>/gi)]
      .map((m) => attributes(m[1]).id)
      .filter((id) => /^record_container_\d+$/.test(id || ""))
      .map((id) => id.slice("record_container_".length));
    observed = records.map((r) => r.recordId);
  } else {
    expected = [...html.matchAll(/<input\b([^>]*)>/gi)]
      .map((m) => attributes(m[1]))
      .filter((a) => a.name?.endsWith("$ItemMasterId"))
      .map((a) => a.value);
    observed = records.map((r) => parseReplayId(r.recordId).sourceId);
  }
  if (JSON.stringify(expected) !== JSON.stringify(observed))
    throw failure(
      "FIDELITY_MISMATCH",
      "Community website rows were clipped, filtered or reordered",
      502,
    );
  return {
    verified: true,
    method: "independent_server_html_record_order",
    variant: profile.kind,
    nativeRows: expected.length,
  };
}
