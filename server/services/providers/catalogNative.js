import { attributes, catalogError, firstIsbn } from "./catalogMarkup.js";
import { CommunitySession, jsonResponse } from "./communitySession.js";
import { hash } from "../catalog-connectors/contracts.js";

export const VMEDU_CLIENT = Object.freeze({
  origin: "https://portal.vmedulife.com",
  page: "/public/library/",
  script: "/public/library/static/js/main.e1a581e9.chunk.js",
  sha256: "0cd12cdc1d7b4465039f8f122dbb8465e5fa0f2326c64432d3e78f15f02b47c1",
});
const profiles = Object.freeze({
  "catalog:adhiparasakthi-kalavai": { slug: "Apce-ranipet", instituteId: 1252 },
  "catalog:scott-christian-nagercoil": {
    slug: "scott-christian-nagercoil",
    instituteId: 1085,
  },
});
export function catalogNativeProfile(entry) {
  const p = profiles[entry.id];
  return p &&
    entry.platform === "catalog" &&
    entry.catalogUrl === `${VMEDU_CLIENT.origin}${VMEDU_CLIENT.page}#/${p.slug}`
    ? { supported: true, kind: "vmedulife", field: "title", ...p }
    : { supported: false };
}
function config(entry) {
  const p = catalogNativeProfile(entry);
  if (!p.supported)
    throw catalogError(
      "Public native catalog configuration requires review",
      "UNSUPPORTED_PROFILE",
    );
  return p;
}
export function vmeduSearchParameters(slug, query) {
  if (
    typeof query !== "string" ||
    !query.trim() ||
    query !== query.trim() ||
    query.length > 160 ||
    /[\x00-\x1f\x7f]/.test(query)
  )
    throw catalogError(
      "Use the literal native Title input",
      "UNSUPPORTED_PROFILE",
    );
  return {
    instituteUrl: slug,
    title: query,
    author: "",
    department: "",
    location: "",
    resourceType: "",
    accessionNo: "",
    isbnNo: "",
    accessionSeriesId: "",
    limit: 30,
    pageIndex: 1,
    categoryId: "",
    edition: "",
  };
}
async function api(
  session,
  operation,
  parameters,
  path = "/api/library/publicLink.php",
) {
  const body = new FormData();
  body.append(operation, "true");
  body.append(
    "data",
    Buffer.from(JSON.stringify(parameters), "utf8").toString("base64"),
  );
  const response = await session.read(path, {
    method: "POST",
    body,
    headers: {
      Accept: "application/json",
      Referer: VMEDU_CLIENT.origin + VMEDU_CLIENT.page,
    },
    allowedResponseTypes: ["application/json", "text/json", "text/html"],
    maxResponseBytes: 2 * 1024 * 1024,
  });
  const payload = jsonResponse(response);
  if (
    payload?.success !== "true" ||
    payload.data == null ||
    typeof payload.data !== "object"
  )
    throw catalogError(
      "Native public API did not return its successful data contract",
    );
  return payload;
}
async function bootstrap(session, p) {
  const payload = await api(
    session,
    "getInstituteDataByURL",
    { url: p.slug },
    "/api/generic_api.php",
  );
  if (
    payload.data.InstituteId !== p.instituteId ||
    typeof payload.data.InstituteName !== "string" ||
    !payload.data.InstituteName.trim()
  )
    throw catalogError(
      "Native public catalog resolved another institution",
      "CATALOG_HOLDING_UNCONFIRMED",
    );
}
function id(value) {
  if (
    !/^[1-9]\d{0,14}$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value))
  )
    throw catalogError("Public resource native identity is missing");
  return String(value);
}
function baseRecord(row, entry) {
  const recordId = id(row.uniqueId);
  if (typeof row.Title !== "string")
    throw catalogError("Public resource title needs review");
  return {
    recordId,
    nativeRecordId: recordId,
    nativeIdKind: "resource_or_copy",
    title: row.Title,
    ...(!row.Title ? { metadataWarnings: ["missing_title"] } : {}),
    authors: row.Author ? [String(row.Author)] : [],
    accessionNumber:
      row.accessionNumber == null ? undefined : String(row.accessionNumber),
    catalogUrl: entry.catalogUrl,
    linkKind: "catalog",
    nativeLookup: {
      kind: "metadata_post_lookup",
      method: "POST",
      path: "/api/library/publicLink.php",
      operation: "getPublicLinkIndividualResourceData",
      parameters: {
        instituteUrl: config(entry).slug,
        uniqueId: Number(recordId),
      },
    },
    observation: {
      outcome: "in_catalog",
      matchKind: "verified_work",
      recognizedExact: false,
      catalogUrl: entry.catalogUrl,
      catalogLinkKind: "catalog",
      locations: [{ name: entry.name, status: "unknown" }],
    },
  };
}
export function parseVmeduSearch(payload, entry) {
  config(entry);
  if (
    payload?.success !== "true" ||
    payload.data == null ||
    typeof payload.data !== "object" ||
    !Number.isSafeInteger(payload.totalCount) ||
    payload.totalCount < 0
  )
    throw catalogError("Native public result count/data contract changed");
  // The real React client uses Object.values and renders rows with a Title.
  // Preserve its default first page. Individual lookups supply material types.
  const rows = Object.values(payload.data).filter(
    (row) => row && row.Title != null,
  );
  if (
    rows.length > 30 ||
    rows.length > payload.totalCount ||
    (payload.totalCount > 0 && !rows.length)
  )
    throw catalogError("Native public result rows/count need review");
  const seen = new Set();
  const records = rows.map((row) => {
    const r = baseRecord(row, entry);
    if (seen.has(r.recordId))
      throw catalogError("Native public result repeats an identity");
    seen.add(r.recordId);
    return { ...r, materialTypeProofPending: true };
  });
  return {
    records,
    total: payload.totalCount,
    hasMore: payload.totalCount > records.length,
    continuationUnsupported: payload.totalCount > records.length,
  };
}
export function parseVmeduRecord(payload, entry, recordId) {
  const p = config(entry);
  id(recordId);
  if (
    payload?.success !== "true" ||
    !payload.data ||
    typeof payload.data !== "object"
  )
    throw catalogError("Native public detail contract changed");
  const rows = Object.values(payload.data);
  if (!rows.length)
    throw catalogError(
      "This institution does not return that resource",
      "CATALOG_HOLDING_UNCONFIRMED",
    );
  if (rows.length !== 1 || id(rows[0].uniqueId) !== recordId)
    throw catalogError("Native public detail identity changed");
  const row = rows[0],
    r = baseRecord(row, entry),
    label = String(row.resourceType || ""),
    book = ["Text Book", "Reference Book", "Book with CD"].includes(label);
  return {
    ...r,
    isbn: firstIsbn(row.ISBN),
    sourceIsbn: row.ISBN,
    edition: row.edition || undefined,
    publishedDate: row.yearOfPublication
      ? String(row.yearOfPublication)
      : undefined,
    publisher: row.publisher_name || undefined,
    nativeMaterialLabel: label,
    materialType: book ? "Book" : label || undefined,
    materialTypeProofPending: !book,
    ...(book ? { materialTypeProof: "native_individual_resource_type" } : {}),
    scopeProof: {
      kind: "public_institute_slug_and_individual_lookup",
      instituteId: p.instituteId,
      slug: p.slug,
    },
  };
}
export async function searchNativeCatalog(
  entry,
  query,
  { field = "title", ...other } = {},
) {
  const p = config(entry);
  if (field !== "title" || Object.keys(other).length)
    throw catalogError(
      "Public catalog supports the first native Title page",
      "UNSUPPORTED_PROFILE",
    );
  const parameters = vmeduSearchParameters(p.slug, query),
    session = new CommunitySession(VMEDU_CLIENT.origin);
  const home = await session.read(VMEDU_CLIENT.page, {
    allowedResponseTypes: ["text/html"],
  });
  const activeScript = [...home.text.matchAll(/<script\b([^>]*)>/gi)]
    .map((m) => attributes(m[1]).src)
    .filter(Boolean)
    .some(
      (src) =>
        new URL(src, home.url).toString() ===
        VMEDU_CLIENT.origin + VMEDU_CLIENT.script,
    );
  if (!activeScript)
    throw catalogError(
      "Public native client version changed",
      "EQUIVALENCE_UNPROVEN",
    );
  const client = await session.read(VMEDU_CLIENT.script, {
    headers: { Accept: "*/*" },
    allowedResponseTypes: [
      "application/javascript",
      "text/javascript",
      "application/x-javascript",
    ],
    maxResponseBytes: 1024 * 1024,
  });
  if (hash(client.text) !== VMEDU_CLIENT.sha256)
    throw catalogError(
      "Public native client contract changed",
      "EQUIVALENCE_UNPROVEN",
    );
  await bootstrap(session, p);
  const payload = await api(session, "getPublicLinkResourceData", parameters);
  return {
    ...parseVmeduSearch(payload, entry),
    nativeProfile: {
      variant: "vmedulife",
      field: "title",
      query,
      instituteSlug: p.slug,
      instituteId: p.instituteId,
      clientSha256: VMEDU_CLIENT.sha256,
      pageSize: 30,
      pageIndex: 1,
      material: "mixed; per-item proof required",
      totalUnit: "native_resource_or_copy_rows",
      supportedScope:
        "All public resources in the selected institute; first native Title-result page",
      parameters,
    },
  };
}
export async function resolveCatalogRecord(entry, recordId) {
  const p = config(entry),
    nativeId = Number(id(recordId)),
    session = new CommunitySession(VMEDU_CLIENT.origin);
  await bootstrap(session, p);
  const payload = await api(session, "getPublicLinkIndividualResourceData", {
    instituteUrl: p.slug,
    uniqueId: nativeId,
  });
  return parseVmeduRecord(payload, entry, recordId);
}
