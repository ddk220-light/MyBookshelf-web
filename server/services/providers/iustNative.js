import { createHash } from "node:crypto";
import { attributes, text, catalogError } from "./catalogMarkup.js";
import recipes from "../catalog-connectors/recipe-contracts.json" with { type: "json" };

const fail = (message) => {
  throw catalogError(message, "EQUIVALENCE_UNPROVEN");
};
function selected(html, id) {
  const select = [
    ...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi),
  ].find((m) => attributes(m[1]).id === id);
  if (!select) return fail("Missing IUST native display control");
  const options = [...select[2].matchAll(/<option\b([^>]*)>/gi)].map((m) =>
    attributes(m[1]),
  );
  const chosen = options.filter((a) => Object.hasOwn(a, "selected"));
  if (chosen.length > 1) return fail("Ambiguous IUST native default");
  return (chosen[0] || options[0])?.value;
}
export function iustAuthors(value) {
  // Match the advertised client, including its removal of the final character.
  return String(value || "")
    .slice(0, -1)
    .split(";")
    .map(text)
    .filter(Boolean);
}
export async function fetchNativeIust(c, query, read, offset = 0) {
  const url = new URL("/result.aspx", c.url);
  url.search = new URLSearchParams({
    cmbval: "Title",
    search: query,
    RDB: "Contains",
    Typemate: "All",
    colltype: "All",
  });
  const page = await read(url, { allowedResponseTypes: ["text/html"] });
  const pageSize = Number(selected(page.text, "cmbrec"));
  if (
    ![20, 50, 100, 200].includes(pageSize) ||
    selected(page.text, "ContentPlaceHolder1_ddl_Sortby") !== "Select"
  )
    return fail("Unreviewed IUST paging or sort default");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % pageSize)
    throw catalogError("Unsupported native IUST page", "UNSUPPORTED_PROFILE");
  const clientUrl = new URL(recipes.iust.clientPath, c.url);
  const advertised = [...page.text.matchAll(/<script\b([^>]*)>/gi)].some(
    (m) => {
      const src = attributes(m[1]).src;
      if (!src) return false;
      return new URL(src, url).toString() === clientUrl.toString();
    },
  );
  if (!advertised) return fail("Missing IUST advertised native client");
  const found = read.cookie?.("dtfound");
  if (!["0", "1"].includes(found))
    return fail("IUST search result cookie is unconfirmed");
  const client = await read(clientUrl);
  const clientSha256 = createHash("sha256").update(client.text).digest("hex");
  if (clientSha256 !== recipes.iust.clientSha256)
    return fail("IUST native client changed; review before searching");
  let payload = [];
  if (found === "1") {
    const response = await read(new URL("/EmployeeDataHandler.ashx", c.url));
    try {
      payload = JSON.parse(response.text);
    } catch {
      return fail("Invalid IUST native JSON");
    }
    if (!Array.isArray(payload) || !payload.length)
      return fail("IUST result cookie and data disagree");
  }
  return {
    payload,
    nativePage: {
      query,
      offset,
      pageSize,
      clientSha256,
      emptyFromNativeCookie: found === "0",
      clientPaging: true,
    },
  };
}

export function parseIustDetails(html, record) {
  const id = [...html.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi)].find(
    (m) => attributes(m[1]).id === "id",
  );
  const titleRow = html.match(
    /<th\b[^>]*>\s*Title\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i,
  );
  if (
    text(id?.[2] || "") !== record.sourceId ||
    text(titleRow?.[1] || "") !== record.title
  )
    throw catalogError(
      "IUST detail identity changed",
      "CATALOG_HOLDING_UNCONFIRMED",
    );
  const marc = [
    ...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table\s*>/gi),
  ].find((m) => attributes(m[1]).id === "myGrid");
  const row = [
    ...(marc?.[2] || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi),
  ]
    .map((m) =>
      [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map((c) => c[1]),
    )
    .find((c) => text(c[0]) === "000");
  // MARC leader character positions are significant; text() would trim them.
  const leader = row?.[3]
    ?.replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ");
  const monograph = Boolean(
    leader && /^[at]$/.test(leader[6]) && leader[7] === "m",
  );
  const serial = Boolean(leader && /^[si]$/.test(leader[7]));
  return {
    ...record,
    materialTypeProofPending: !monograph && !serial,
    ...(monograph
      ? {
          materialType: "Monograph",
          materialTypeProof: "native_MARC_leader_type_and_bibliographic_level",
        }
      : serial
        ? {
            materialType: "Serial",
            materialTypeProof: "native_MARC_bibliographic_level",
          }
        : {}),
    nativeMarcLeader: leader || null,
  };
}
