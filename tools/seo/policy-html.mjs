// The public /privacy and /terms pages from the approved policy texts
// (docs/policy/*.md), for the release switch (VITE_POLICY_EFFECTIVE_DATE; see
// docs/RELEASE-one-shelf.md). The same small Markdown subset as the app's
// reader (client/src/v2/ui/panel/policyText.tsx): "# " and "## " headings,
// paragraphs, "- " lists, pipe tables, **bold** and plain email addresses.
// The leading "> Draft ..." review note is left out; words are not changed.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

/** The value checked the same way as the app's (buildInfo.ts), or null. */
export function policyEffectiveDate(value) {
  return typeof value === 'string' && /^[\p{L}\p{N} ,.-]{4,40}$/u.test(value.trim()) ? value.trim() : null;
}

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map(part => /^\*\*[^*]+\*\*$/.test(part)
    ? `<strong>${escape(part.slice(2, -2))}</strong>`
    : part.split(EMAIL).map((piece, at) => (at % 2 ? `<a href="mailto:${escape(piece)}">${escape(piece)}</a>` : escape(piece))).join('')).join('');
}

/** { title, html } for one policy text, with [EFFECTIVE DATE] filled in. */
export function policyHtml(markdown, { effectiveDate }) {
  if (!policyEffectiveDate(effectiveDate)) throw Error('A policy page is published only with its effective date.');
  const text = markdown.replace(/\r\n?/g, '\n').split('[EFFECTIVE DATE]').join(effectiveDate.trim());
  if (/\[[A-Z][A-Z ]+\]/.test(text)) throw Error('A policy text still has a placeholder.');
  const out = [];
  let title = '', paragraph = [], list = null, table = null;
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    if (list) out.push(`<ul>${list.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`);
    if (table?.length) out.push(`<table><thead><tr>${table[0].map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${table.slice(1)
      .map(row => `<tr>${row.map((cell, at) => (at ? `<td>${inline(cell)}</td>` : `<th scope="row">${inline(cell)}</th>`)).join('')}</tr>`).join('')}</tbody></table>`);
    paragraph = []; list = null; table = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('>')) { flush(); continue; }
    if (line.startsWith('# ')) { flush(); title = line.slice(2).trim(); continue; }
    if (line.startsWith('## ')) { flush(); out.push(`<h2>${inline(line.slice(3).trim())}</h2>`); continue; }
    if (line.startsWith('|')) {
      if (!table) { flush(); table = []; }
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
      if (!cells.every(cell => /^:?-{3,}:?$/.test(cell))) table.push(cells);
      continue;
    }
    if (line.startsWith('- ')) { if (!list) { flush(); list = []; } list.push(line.slice(2).trim()); continue; }
    if (list && /^\s+\S/.test(raw)) { list[list.length - 1] += ' ' + line.trim(); continue; }
    if (list || table) flush();
    paragraph.push(line.trim());
  }
  flush();
  return { title, html: out.join('') };
}
