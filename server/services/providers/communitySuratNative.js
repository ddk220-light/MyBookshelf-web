import { catalogError, text } from "./catalogMarkup.js";
import { CommunitySession, jsonResponse } from "./communitySession.js";
import { observation } from "./communityRecords.js";

// Public search form and scripts reviewed on 8 November 2026. DataTables
// 1.10.4 displays ten rows, with a one-page pipeline and BookName ASC order.
// These are copy rows, not distinct bibliographic books or typed materials.
export const SURAT_NATIVE_CLIENT = Object.freeze({
  search: "2eb2bb8d284bee899df2503be1d1a5f4fbb83f8e7921e34bd5e6759f4f7ce418",
  pipeline: "4df48ccfdfd9346c65824f0cc1fc8b3f2d7a5ab5554b10e135e287a9c2706f35",
  dataTables:
    "d1b46e1af87575cf4814d7de276b6f368c770dd3e571a5b60ceb3329571d893b",
});
const fields = [
  "BookCode",
  "BookName",
  "Language",
  "BookStatus",
  "LibraryName",
  "SectionName",
  "IssueDate",
  "ExpectedReturnDate",
  "AverageRating",
];

export function suratNativeParams(library, query, offset = 0) {
  if (
    typeof query !== "string" ||
    query.length < 2 ||
    query.length > 50 ||
    /[\x00-\x1f\x7f]/.test(query) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 1000000 ||
    offset % 10
  )
    throw catalogError(
      "Native municipal title/page profile is unsupported",
      "UNSUPPORTED_PROFILE",
    );
  const params = new URLSearchParams({
    draw: String(offset / 10 + 1),
    start: String(offset),
    length: "10",
    "search[value]": "",
    "search[regex]": "false",
    "order[0][column]": "1",
    "order[0][dir]": "asc",
    "CustomData[SearchType]": "BookName",
    "CustomData[SearchBy]": query,
    "CustomData[LibraryId]": library.communityCatalog.scope,
    "CustomData[bookCLSVal]": "",
  });
  fields.forEach((field, i) =>
    Object.entries({
      data: field,
      name: "",
      searchable: "true",
      orderable: "false",
      "search][value": "",
      "search][regex": "false",
    }).forEach(([name, value]) => params.set(`columns[${i}][${name}]`, value)),
  );
  return params;
}

export function parseNativeSurat(data, library, offset = 0) {
  if (
    data?.status !== 200 ||
    !Array.isArray(data.data) ||
    data.data.length > 10 ||
    !Number.isSafeInteger(data.iTotalRecords) ||
    data.iTotalRecords < 0 ||
    !Number.isSafeInteger(data.iTotalDisplayRecords) ||
    data.iTotalDisplayRecords < data.data.length ||
    (data.iTotalDisplayRecords > offset && !data.data.length)
  )
    throw catalogError("Native municipal rows/count need review");
  const ids = new Set();
  const records = data.data.map((row) => {
    if (String(row.LibraryId) !== library.communityCatalog.scope)
      throw catalogError(
        "Native municipal page belongs to another library",
        "CATALOG_HOLDING_UNCONFIRMED",
      );
    if (
      !/^\d{1,20}$/.test(String(row.BookId)) ||
      !/^[A-Za-z0-9]{1,20}$/.test(row.BookCode || "") ||
      !text(row.BookName)
    )
      throw catalogError("Native municipal copy identity/title missing");
    const recordId = `s1_${row.BookCode}_${row.BookId}`;
    if (ids.has(recordId))
      throw catalogError("Native municipal page repeats a copy identity");
    ids.add(recordId);
    return {
      recordId,
      nativeRecordId: String(row.BookId),
      nativeIdKind: "copy",
      accessionCode: row.BookCode,
      title: text(row.BookName),
      authors: row.AuthorName ? [text(row.AuthorName)] : [],
      language: text(row.Language),
      // BookName is a column label, not an item-specific bibliographic type.
      materialTypeProofPending: true,
      observation: observation(
        library,
        library.catalogUrl,
        "unknown",
        row.ClassificationNo,
      ),
    };
  });
  const total = data.iTotalDisplayRecords,
    hasMore = offset + records.length < total;
  return {
    records,
    total,
    hasMore,
    ...(hasMore ? { nextOffset: offset + 10 } : {}),
  };
}

export async function searchNativeSurat(
  library,
  query,
  { offset = 0, field = "title" } = {},
) {
  if (field !== "title")
    throw catalogError(
      "Municipal native field is Title",
      "UNSUPPORTED_PROFILE",
    );
  const params = suratNativeParams(library, query, offset);
  const response = await new CommunitySession(
    "https://office.suratmunicipal.org",
  ).read(`/LMS/Home/GetSearchData?${params}`);
  return {
    ...parseNativeSurat(jsonResponse(response), library, offset),
    nativeProfile: {
      variant: "surat",
      field: "title",
      query,
      branch: library.communityCatalog.scope,
      offset,
      pageSize: 10,
      order: [[1, "asc"]],
      totalUnit: "copy_rows",
      material: "unspecified",
      clientSha256: SURAT_NATIVE_CLIENT.search,
      pipelineSha256: SURAT_NATIVE_CLIENT.pipeline,
      dataTablesSha256: SURAT_NATIVE_CLIENT.dataTables,
    },
  };
}
