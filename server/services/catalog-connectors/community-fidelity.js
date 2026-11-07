import { failure } from "./contracts.js";
import { attributes, text } from "../providers/catalogMarkup.js";
import { parseReplayId } from "../providers/communityRecords.js";
import { communityNativeProfile } from "../providers/discoveryCommunity.js";

export function communityFidelity(entry, response, records) {
  const profile = communityNativeProfile(entry);
  if (!profile.supported)
    return { verified: false, reason: "website_display_contract_pending" };
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
