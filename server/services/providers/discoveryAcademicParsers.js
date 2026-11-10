import { createHash } from 'node:crypto';
import { autolibSmartMatch } from './autolibNative.js';
import { iustAuthors } from './iustNative.js';
import { attributes, text, firstIsbn, catalogError } from './catalogMarkup.js';

const integer = value => /^\d+$/.test(String(value ?? '').trim()) ? Number(value) : undefined;
const norm = value => text(value).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cells = row => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(m => m[1]);
function table(html, id) {
  const opening = [...html.matchAll(/<table\b([^>]*)>/gi)].find(m => attributes(m[1]).id === id);
  if (!opening) return null;
  const pattern = /<\/?table\b[^>]*>/gi; pattern.lastIndex = opening.index + opening[0].length;
  let depth = 1, m;
  while ((m = pattern.exec(html))) {
    depth += /^<\//.test(m[0]) ? -1 : 1;
    if (!depth) return html.slice(opening.index + opening[0].length, m.index);
  }
  throw catalogError('Incomplete catalog table');
}
function rows(value) { return [...String(value || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].map(m => cells(m[1])).filter(x => x.length); }
function fields(value) { return Object.fromEntries([...value.matchAll(/<tr\b[^>]*>\s*<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)].map(m => [norm(m[1]),text(m[2])])); }
function book(title, author, extra = {}) { return { title: text(title), authors: text(author) ? [text(author)] : [], isbn: null, ...extra }; }
function status(value) {
  const s = norm(value);
  if (s === 'available') return 'available';
  if (['issued','checked out','on loan','unavailable'].includes(s)) return 'unavailable';
  return 'unknown';
}
function proof(records, complete = true, explicitEmpty = false) {
  if (!records.every(b => b.title && b.title.length <= 2000)) throw catalogError('Malformed bibliographic record');
  return { records, complete, explicitEmpty };
}
export function recordFingerprint(b) {
  return createHash('sha256').update(JSON.stringify([b.sourceId || '',b.title,b.authors,b.isbn,b.publisher || '',b.publishedDate || '',b.callNumber || ''])).digest('hex').slice(0,20);
}
function grouped(records, complete) {
  const result = new Map();
  for (const b of records) {
    const key = recordFingerprint(b), old = result.get(key);
    if (!old) result.set(key,{ ...b, locations: [...(b.locations || [])] });
    else {
      for (const field of ['totalCopies','availableCopies']) if (old[field] !== undefined && b[field] !== undefined) old[field] += b[field]; else delete old[field];
      if (b.outcome === 'available') old.outcome = 'available';
      else if (old.outcome !== 'available' && b.outcome !== old.outcome) old.outcome = 'in_catalog';
      old.locations.push(...(b.locations || []));
    }
  }
  if (!complete) for (const b of result.values()) { delete b.totalCopies; delete b.availableCopies; if (b.outcome === 'none_available') b.outcome = 'in_catalog'; }
  return [...result.values()];
}
export function rejectChallenge(html) {
  // A site-wide CAPTCHA loader or a book title mentioning CAPTCHA does not
  // establish a denied search. Actual challenge pages/widgets still stop us.
  const markup = String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const gate = /^(?:just a moment(?:\.{3}|…)?|checking your browser(?:\b|$)|(?:please\s+)?verify (?:that )?you are (?:a )?human(?:\b|$)|attention required\b)/i;
  const challengeHeading = [...markup.matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].some(m => gate.test(text(m[2])));
  const activeCaptcha = [...markup.matchAll(/<(?:input|textarea|iframe|div|span)\b([^>]*)>/gi)].some(m => {
    const a = attributes(m[1]);
    return [a.name, a.id, a.class].filter(Boolean).some(value => /(?:^|[\s_.\[\]-])(?:(?:g|h)[-_])?(?:re)?captcha(?:[\s_.\[\]-]|$)/i.test(value));
  });
  if (/cf-chl-|challenge-platform/i.test(html) || challengeHeading || activeCaptcha || gate.test(text(markup))) throw catalogError('Public catalog access challenge','CATALOG_PROVIDER_BLOCKED');
  if (/fatal error:|server error in ['"]|exception details:|<(?:title|h1)\b[^>]*>\s*(?:\d{3}\s*)?(?:access denied|unauthorized)/i.test(html)) throw catalogError('Catalog application error','CATALOG_UNAVAILABLE');
}
export function parseAcademicResponse(kind, payload, { query = '', isbn = null, native = false } = {}) {
  if (typeof payload === 'string') rejectChallenge(payload);
  if (kind === 'srms') {
    if (!Array.isArray(payload) || payload.some(r => !r || typeof r.title !== 'string' || !Object.hasOwn(r,'author_name'))) throw catalogError('Unrecognized college-scoped response');
    return proof(payload.map(r => book(r.title,r.author_name)), true, payload.length === 0);
  }
  if (kind === 'autolib') {
    if (!Array.isArray(payload?.data) || payload.data.some(r => !Array.isArray(r) || r.length < 9)) throw catalogError('Unrecognized public book export');
    if(native && payload.data.some(r=>r.length!==12))throw catalogError('Native Autolib barcode/column contract requires review','EQUIVALENCE_UNPROVEN');
    if(native){const selected=payload.data.filter(r=>autolibSmartMatch(r[5],query));if(selected.some(r=>!text(r[2])||text(r[2])==='NA'))throw catalogError('Matched native Autolib row lacks a barcode; identity needs review','EQUIVALENCE_UNPROVEN');return proof(selected.map(r=>book(r[5],r[6],{sourceId:text(r[2]),recordIdKind:'native_copy_barcode',accessionNumber:text(r[3]),isbn:firstIsbn(r[4]),publisher:text(r[8]),subjects:[text(r[7])].filter(Boolean),format:text(r[11]),totalCopies:1})),true,selected.length===0);}
    const all = payload.data.map(r => book(r[5],r[6],{isbn:firstIsbn(r[4]),publisher:text(r[8]),subjects:[text(r[7])].filter(Boolean),totalCopies:1}));
    const selected = all.filter(b => isbn ? b.isbn === isbn : norm(b.title).includes(norm(query)));
    return proof(native?selected:grouped(selected,true),true,selected.length === 0);
  }
  if (kind === 'easylib') {
    if (!Array.isArray(payload?.realdata) || integer(payload.recordsFiltered) === undefined || norm(payload.search) !== norm(query)) throw catalogError('Unrecognized or wrong-query Easylib response');
    const records = payload.realdata.map(r => {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(r.Fld_Title_No || ''))) throw catalogError('Missing Easylib title identity');
      return book(r.Fld_Title,r.Fld_Authors,{sourceId:String(r.Fld_Title_No),isbn:firstIsbn(r.Fld_ISBN_No),publisher:text(r.Fld_Publisher),publishedDate:text(r.Fld_Published_Year),subjects:[text(r.Fld_Subject)].filter(v => v && v !== 'None'),callNumber:text(r.Fld_Call_No),format:text(r.Fld_NB_Type),totalCopies:integer(r.Fld_No_Copies)});
    });
    return proof(records,Number(payload.recordsFiltered) <= records.length,Number(payload.recordsFiltered) === 0);
  }
  if (kind === 'iust') {
    if (!Array.isArray(payload) || payload.some(r => !/^\d+$/.test(String(r.RecID)) || typeof r.Title !== 'string')) throw catalogError('Unrecognized SOUL bibliographic response');
    return proof(payload.map(r => book(r.Title,r.Author,{sourceId:String(r.RecID),isbn:firstIsbn(r.isbn),publisher:text(r.Publisher),publishedDate:text(r.Year),format:text(r.TypeofMaterial),...(native?{authors:iustAuthors(r.Author),nativeRawAuthor:r.Author,materialTypeProofPending:true}:{})})),true,payload.length === 0);
  }
  const html = String(payload || '');
  if (kind === 'libsoft') {
    const count=text(html).match(/(\d+)\s+Book Titles are found/i);if(!count)throw catalogError('Unrecognized LIBSOFT search');
    const records=rows(html).filter(r=>r.length===3&&/titledetails\.php/.test(r[0])).map(r=>book(r[0],r[1],{totalCopies:integer(text(r[2]))}));
    if(Number(count[1])&&!records.length)throw catalogError('Missing LIBSOFT book rows');
    return proof(records,Number(count[1])<=records.length,Number(count[1])===0);
  }
  if (kind === 'nios') {
    if(!/NATIONAL INSTITUTE OF OPEN SCHOOLING/.test(text(html)))throw catalogError('Wrong LIBSYS institution');
    const panel=[...html.matchAll(/<div\b([^>]*)>/gi)].map(m=>attributes(m[1])).find(a=>a.id==='resultsPnl');
    if(!panel)throw catalogError('Missing LIBSYS result panel');
    if(/No Record Found/.test(text(html))&&['0','null'].includes(panel._totalhits))return proof([],true,true);
    const starts=[...html.matchAll(/<div\b([^>]*\bclass=['"]recordObjectDiv['"][^>]*)>/gi)];
    const records=starts.map((m,i)=>{
      const a=attributes(m[1]),s=html.slice(m.index+m[0].length,starts[i+1]?.index||html.length);
      if(!/^\d+$/.test(a.titleobjectinfo||''))throw catalogError('Missing LIBSYS record identity');
      const label=id=>text(s.match(new RegExp(`<p\\b[^>]*id=['"]${id}['"][^>]*>([\\s\\S]*?)<\\/p>`,'i'))?.[1]||'');
      const rawTitle=label('Label35'),year=rawTitle.match(/,\s*(\d{4})\.?$/)?.[1];
      return book(year?rawTitle.replace(/,\s*\d{4}\.?$/,''):rawTitle,label('Label36'),{sourceId:a.titleobjectinfo,isbn:firstIsbn(a.isbn)||firstIsbn(a.isbn10),publishedDate:year,...(native?{nativeDisplayTitle:rawTitle}:{}),callNumber:label('Label56')});
    });
    if(!records.length)throw catalogError('Missing LIBSYS book records');
    return proof(records,integer(panel._totalhits)!==undefined&&Number(panel._totalhits)<=records.length,false);
  }
  if (kind === 'librarika') {
    if (!/id=['"]FilterIndexForm['"]/.test(html)) throw catalogError('Unrecognized Librarika search');
    if (/No records found, please try again/i.test(text(html))) return proof([],true,true);
    const records = rows(html).filter(r=>r.length===6&&/media-item-meta/.test(r[1])).map(r=>{
      const link=r[1].match(/<a\b[^>]*href=['"]\/search\/detail\/(\d+)['"][^>]*>([\s\S]*?)<\/a>/i);
      if (!link) throw catalogError('Missing Librarika record identity');
      const isbnFields=[...r[1].matchAll(/<span\b[^>]*class=['"]media-meta-field-name['"][^>]*>ISBN(?: 13)?<\/span>\s*:\s*<span\b[^>]*>([\s\S]*?)<\/span>/gi)];
      return book(link[2],r[2],{sourceId:link[1],isbn:isbnFields.map(m=>firstIsbn(m[1])).find(Boolean)||null,publisher:text(r[3]),format:text(r[4]),totalCopies:integer(text(r[5]))});
    });
    if (!records.length) throw catalogError('Missing Librarika book rows');
    const page=text(html).match(/Page\s+(\d+)\s+of\s+(\d+)/i);
    return proof(records,Boolean(page&&page[1]===page[2]),false);
  }
  if (kind === 'libaitech') {
    const details = [...html.matchAll(/<table\b[^>]*class=['"][^'"]*\bdetail-table\b[^'"]*['"][^>]*>([\s\S]*?)<\/table>/gi)];
    const records = details.map((m,i) => {
      const f = fields(m[1]), after = html.slice(m.index+m[0].length,details[i+1]?.index || html.length);
      const holding = after.match(/<table\b[^>]*class=['"][^'"]*\bcustom-responsive\b[^'"]*['"][^>]*>([\s\S]*?)<\/table>/i)?.[1];
      const copies = rows(holding).filter(r => r.length === 7).map(r => ({name:text(r[6]) || f.location || 'Library',status:status(r[1])}));
      const known = copies.length && copies.every(r => r.status !== 'unknown');
      return book(f.title,f.author,{...(f['material type']?{materialType:f['material type'],materialTypeProof:'labeled_public_bibliographic_material_type'}:{}),isbn:firstIsbn(f.isbn),publisher:f.publisher,publishedDate:f['year of publication'],subjects:[f.subjects].filter(Boolean),callNumber:f['call no'],outcome:copies.some(r => r.status === 'available') ? 'available' : known ? 'none_available' : 'in_catalog',...(copies.length ? {totalCopies:copies.length} : {}),...(known ? {availableCopies:copies.filter(r => r.status === 'available').length} : {}),locations:copies});
    });
    const form = /id=['"]search_form['"]/.test(html) && [...html.matchAll(/<input\b([^>]*)>/gi)].some(m => { const a=attributes(m[1]); return a.name === 'q' && norm(a.value) === norm(query); });
    if (!records.length && !form) throw catalogError('Unrecognized WebOPAC search page');
    return proof(records,true,!records.length && form);
  }
  if (kind === 'rps') {
    const t = table(html,'myTable'); if (t === null || !/Book(?:&nbsp;|\s)*Name/i.test(t)) throw catalogError('Unrecognized RPS results');
    const dataRows = rows(t);if(dataRows.some(r=>r.length!==8))throw catalogError('RPS result columns changed');
    const records = dataRows.map(r => book(r[2],r[3],{...(native?{nativeOrderKey:text(r[0])}:{}),publisher:text(r[4]),subjects:[text(r[5])].filter(Boolean),locations:[{name:`Almirah ${text(r[6])}, shelf ${text(r[7])}`,status:'unknown'}],totalCopies:1}));
    return proof(native?records:grouped(records,true),true,!records.length);
  }
  if (kind === 'mizoram') {
    const count=html.match(/id=['"]lblResultFound['"][^>]*>\s*(\d+) Records Found/i);if (!count) throw catalogError('Unrecognized Mizoram search');
    const t=table(html,'DataList1'), records=rows(t).filter(r => r.length === 5 && /_ctl(?!00_)\d+_lblTitle["']/i.test(r[1])).map(r => {
      const label=text(r[1]),split=label.lastIndexOf('/');
      return book(split<0?label:label.slice(0,split),split<0?'':label.slice(split+1),{...(native?{nativeDisplayTitle:label}:{}),callNumber:text(r[0]),publishedDate:text(r[2]),totalCopies:integer(text(r[3]))});
    });
    if (Number(count[1]) && !records.length) throw catalogError('Missing Mizoram records');
    return proof(records,Number(count[1])<=records.length,Number(count[1])===0);
  }
  if (kind === 'processcube') {
    const count=html.match(/Total Books:\s*(\d+)/i);if (!count) throw catalogError('Unrecognized ProcessCUBE search');
    const t=table(html,'grid_book');const records=rows(t).filter(r=>r.length===9).map(r=>book(r[1],r[2],{publisher:text(r[3]),subjects:[text(r[4])].filter(Boolean),publishedDate:text(r[5]),totalCopies:1,locations:[{name:[text(r[6]),text(r[7])].filter(Boolean).join(' / '),status:'unknown'}]}));
    if (Number(count[1])&&!records.length)throw catalogError('Missing ProcessCUBE records');
    const complete=Number(count[1])<=records.length;
    return proof(native?records:grouped(records,complete),complete,Number(count[1])===0);
  }
  if (kind === 'bmu') {
    if (/No books found\./i.test(text(html))) return proof([],true,true);
    const t=table(html,'gvBooks');if (!t||!/Accession No/.test(text(t)))throw catalogError('Unrecognized university catalog');
    const records=rows(t).filter(r=>r.length===7&&!/<table\b/i.test(r.join(''))).map(r=>{const st=status(r[6]);return book(r[0],r[1],{subjects:[text(r[2])].filter(Boolean),outcome:st==='available'?'available':st==='unavailable'?'none_available':'in_catalog',totalCopies:1,...(st!=='unknown'?{availableCopies:st==='available'?1:0}:{}),locations:[{name:[text(r[3]),text(r[5])].filter(Boolean).join(' / '),status:st}]});});
    if (!records.length)throw catalogError('Missing university book rows');
    const complete=!/Page\$\d+/.test(html);return proof(native?records:grouped(records,complete),complete,false);
  }
  if (kind === 'darshan') {
    const t=table(html,'tblList');if (t===null||!/Available/.test(text(t)))throw catalogError('Unrecognized Darshan search');
    const dataRows=rows(t);if(dataRows.some(r=>r.length!==8))throw catalogError('Darshan result columns changed');
    const records=dataRows.map(r=>{
      const href=[...r[0].matchAll(/<a\b([^>]*)>/gi)].map(m=>attributes(m[1]).href).find(Boolean),u=new URL(href||'https://invalid.invalid','https://library.darshan.ac.in');
      if(u.origin!=='https://library.darshan.ac.in'||u.pathname!=='/Home/BookInformation'||!/^[A-Za-z0-9+/$=_-]{1,80}$/.test(u.searchParams.get('Enc_MaterialID')||''))throw catalogError('Unexpected Darshan book link');
      const total=integer(text(r[5])),avail=integer(text(r[6]));if(total===undefined||avail===undefined||avail>total)throw catalogError('Invalid copy counts');
      return book(r[0],r[1],{sourceId:u.searchParams.get('Enc_MaterialID'),publisher:text(r[2]),format:text(r[3]),totalCopies:total,availableCopies:avail,outcome:avail?'available':'none_available',locations:[{name:text(r[7])||'Library',status:avail?'available':'unavailable',totalCopies:total,availableCopies:avail}]});
    });return proof(native?records:grouped(records,true),true,!records.length);
  }
  throw catalogError('Catalog parser is not configured','CATALOG_CONFIGURATION_REQUIRED');
}
export function parseEasylibAvailability(payload) {
  if(!Array.isArray(payload?.book)||payload.book.some(r=>typeof r.status!=='string'))throw catalogError('Unrecognized copy statuses');
  const rows=payload.book.map(r=>({name:[text(r.homeBranch),text(r.Fld_Location)].filter(Boolean).join(' / ')||'Library',status:status(r.status)}));
  if(!rows.length)return {};
  const known=rows.every(r=>r.status!=='unknown');
  return {outcome:rows.some(r=>r.status==='available')?'available':known?'none_available':'in_catalog',totalCopies:rows.length,...(known?{availableCopies:rows.filter(r=>r.status==='available').length}:{}),locations:rows};
}
export function parseDarshanIsbn(html,expected) {
  rejectChallenge(html);
  if(expected){
    const heading=html.match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1];
    const detailFields=Object.fromEntries(rows(html).filter(r=>r.length===2).map(r=>[norm(r[0]),norm(r[1])]));
    const author=detailFields.author,searchAuthors=norm((expected.authors||[]).join(' '));
    if(norm(heading||'')!==norm(expected.title)||!author||!searchAuthors||!(searchAuthors.includes(author)||author.includes(searchAuthors)))throw catalogError('Darshan detail identity changed','CATALOG_HOLDING_UNCONFIRMED');
    if(detailFields.publication&&expected.publisher&&detailFields.publication!==norm(expected.publisher))throw catalogError('Darshan detail publication changed','CATALOG_HOLDING_UNCONFIRMED');
  }
  // Only the labeled ISBN field, never unrelated numeric identifiers or recommendations.
  const labels = [...html.matchAll(/ISBN(?:\s*(?:-\s*(?:10|13)|No\.?|Number))?\s*:?\s*<\/[^>]+>\s*<(?:td|div|span)[^>]*>([\s\S]*?)<\/(?:td|div|span)>/gi)];
  return labels.map(m=>firstIsbn(m[1])).find(Boolean)||null;
}
export function parseLibsoftDetails(html,expected) {
  rejectChallenge(html);
  const f=Object.fromEntries([...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>[norm(m[1]),text(m[2])]));
  if(norm(f.title)!==norm(expected.title)||norm(f.author)!==norm(expected.authors.join(' ')))throw catalogError('LIBSOFT detail identity changed');
  return {publisher:f.publisher,callNumber:f['call no'],publishedDate:f.year,subjects:[f.subject].filter(Boolean)};
}
export { norm as normalizeCatalogTitle };
