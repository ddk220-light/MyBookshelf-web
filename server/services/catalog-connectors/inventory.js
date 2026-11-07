import { getAllLibraries } from "../directory.js";
import { getProvider } from "../providers/index.js";
import { readFileSync } from "node:fs";
import { hash, VERSION } from "./contracts.js";
import { academicNativeProfile } from "../providers/discoveryAcademic.js";
import { communityNativeProfile } from "../providers/discoveryCommunity.js";

export const nativeFamilies = new Set([
  "egranthalaya",
  "indcat",
  "koha",
  "libman",
  "vufind",
  "vpl",
  "discovery-academic",
  "discovery-community",
]);
export function describe(entry, connectionId = "primary") {
  const origins = [
    ...new Set(
      [entry.baseUrl, entry.catalogUrl]
        .filter(Boolean)
        .map((v) => new URL(v).origin),
    ),
  ];
  const provider = getProvider({ ...entry, alternateCatalogs: [] });
  let academicNative = false;
  if (entry.platform === "discovery-academic") {
    try {
      academicNative = academicNativeProfile(entry).supported;
    } catch {}
  }
  let communityNative = false;
  if (entry.platform === "discovery-community") {
    try {
      communityNative = communityNativeProfile(entry).supported;
    } catch {}
  }
  const native =
    nativeFamilies.has(entry.platform) &&
    (entry.platform !== "discovery-academic" || academicNative) &&
    (entry.platform !== "discovery-community" || communityNative) &&
    !(entry.platform === "koha" && entry.publicCatalogApi);
  return {
    connectionId,
    family: entry.platform,
    origins,
    memberCode:
      entry.egranthalayaLibraryCode ||
      entry.indcatInstitutionCode ||
      entry.kohaBranchCode ||
      entry.libmanLibraryId ||
      entry.vufindBuilding ||
      null,
    cluster: entry.egranthalayaCluster || null,
    catalogUrl: entry.catalogUrl,
    mode: native
      ? "native_http"
      : provider?.searchCatalog
        ? "legacy_http_review"
        : "unsupported",
    fields:
      entry.platform === "egranthalaya"
        ? ["keyword", "title"]
        : ["libman", "vufind", "vpl", "discovery-academic"].includes(
              entry.platform,
            )
          ? [
              entry.platform === "discovery-academic" && academicNative
                ? academicNativeProfile(entry).field
                : "title",
            ]
          : ["keyword"],
    paging:
      ["koha", "vufind"].includes(entry.platform) ||
      (academicNative &&
        ["autolib", "srms", "easylib", "rps", "libaitech"].includes(
          academicNativeProfile(entry).kind,
        ))
        ? "native"
        : "first_page",
    fidelity: "pending_live_validation",
    policy: "robots_checked_on_request",
    adapterVersion: VERSION,
  };
}
export function inventory({ country = "IN" } = {}) {
  const entries = getAllLibraries().filter(
    (e) => country === "*" || e.country === country,
  );
  const rows = entries.map((e) => ({
    libraryId: e.id,
    name: e.name,
    country: e.country,
    region: e.region || null,
    city: e.city || null,
    connections: [
      describe(e),
      ...(e.alternateCatalogs || []).map((a, i) =>
        describe(a, `alternate-${i + 1}`),
      ),
    ],
  }));
  const allConnections = new Map();
  for (const e of getAllLibraries())
    for (const c of [e, ...(e.alternateCatalogs || [])])
      for (const key of [
        c.sourceConnectionId,
        c.networkConnectionId,
        c.researchId,
      ])
        if (key) allConnections.set(key, e.id);
  const reconciliation = [];
  for (const name of ["india-catalogs", "discovered-catalogs"]) {
    const data = JSON.parse(
      readFileSync(new URL(`../../data/${name}.json`, import.meta.url)),
    );
    for (const row of data.omitted || []) {
      const id = row.connectionId || row.researchId;
      reconciliation.push({
        source: name,
        sourceId: id,
        libraryId: allConnections.get(id) || null,
        state: allConnections.has(id) ? "mapped" : "needs_review",
        historicalReason: row.reason,
      });
    }
  }
  return {
    schemaVersion: 1,
    adapterVersion: VERSION,
    country,
    createdAt: new Date().toISOString(),
    inventoryHash: hash(rows),
    total: rows.length,
    libraries: rows,
    reconciliation,
  };
}
