import { failure, hash } from "./contracts.js";
import {
  VMEDU_CLIENT,
  catalogNativeProfile,
} from "../providers/catalogNative.js";

export function catalogFidelity(entry, responses, records, profile) {
  const p = catalogNativeProfile(entry);
  const bad = () => {
    throw failure(
      "FIDELITY_MISMATCH",
      "Public native request, institution or display rows changed",
      502,
    );
  };
  if (!p.supported)
    return { verified: false, reason: "native_catalog_contract_pending" };
  const client = responses.find(
    (r) =>
      r.url === VMEDU_CLIENT.origin + VMEDU_CLIENT.script && r.status === 200,
  );
  const bootstrap = responses.find(
    (r) =>
      r.url === VMEDU_CLIENT.origin + "/api/generic_api.php" &&
      r.status === 200,
  );
  const response = responses.at(-1);
  if (
    !client ||
    hash(client.text) !== VMEDU_CLIENT.sha256 ||
    !bootstrap ||
    response?.status !== 200 ||
    response.url !== VMEDU_CLIENT.origin + "/api/library/publicLink.php" ||
    response.method !== "POST"
  )
    bad();
  let params, scope, payload;
  try {
    if (
      response.bodyFields.getPublicLinkResourceData !== "true" ||
      bootstrap.bodyFields.getInstituteDataByURL !== "true"
    )
      bad();
    params = JSON.parse(
      Buffer.from(response.bodyFields.data, "base64").toString("utf8"),
    );
    scope = JSON.parse(bootstrap.text);
    payload = JSON.parse(response.text);
    const requestedScope = JSON.parse(
      Buffer.from(bootstrap.bodyFields.data, "base64").toString("utf8"),
    );
    if (requestedScope.url !== p.slug) bad();
  } catch {
    bad();
  }
  if (
    scope.success !== "true" ||
    scope.data?.InstituteId !== p.instituteId ||
    payload.success !== "true" ||
    profile?.instituteId !== p.instituteId ||
    profile?.instituteSlug !== p.slug ||
    params.instituteUrl !== p.slug ||
    params.title !== profile?.query ||
    JSON.stringify(params) !== JSON.stringify(profile?.parameters) ||
    params.pageIndex !== 1 ||
    params.limit !== 30 ||
    [
      "author",
      "department",
      "location",
      "resourceType",
      "accessionNo",
      "isbnNo",
      "accessionSeriesId",
      "categoryId",
      "edition",
    ].some((k) => params[k] !== "")
  )
    bad();
  const expected = Object.values(payload.data || {})
    .filter((r) => r && r.Title != null)
    .map((r) => [
      String(r.uniqueId),
      r.Title,
      r.Author ? [String(r.Author)] : [],
    ]);
  if (
    JSON.stringify(expected) !==
    JSON.stringify(records.map((r) => [r.recordId, r.title, r.authors]))
  )
    bad();
  return {
    verified: true,
    method:
      "primary_public_client_multipart_title_and_source_object_value_order",
    nativeRows: expected.length,
    supportedScope: "selected institute, first native page",
    perItemMaterialProofRequired: true,
  };
}
