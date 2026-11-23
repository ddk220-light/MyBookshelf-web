// The public /privacy and /terms pages from the approved policy texts
// (docs/policy/*.md), with their committed effective date
// (shared/policy-effective-date.mjs). The same small Markdown subset as the app's
// reader (client/src/v2/ui/panel/policyText.tsx): "# " and "## " headings,
// paragraphs, "- " lists, pipe tables, **bold** and plain email addresses.
// The leading "> Draft ..." review note is left out; words are not changed.
import { policyEffectiveDate, withEffectiveDate } from '../../shared/policy-effective-date.mjs';

export { policyEffectiveDate };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

export function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map(part => /^\*\*[^*]+\*\*$/.test(part)
    ? `<strong>${escape(part.slice(2, -2))}</strong>`
    : part.split(EMAIL).map((piece, at) => (at % 2 ? `<a href="mailto:${escape(piece)}">${escape(piece)}</a>` : escape(piece))).join('')).join('');
}

/**
 * The blocks of one text in that subset: { type: 'h1' | 'h2' | 'p', text },
 * { type: 'ul', items } and { type: 'table', rows } (the first row is the
 * head). Review notes ("> ...") are left out.
 */
export function policyBlocks(markdown) {
  const blocks = [];
  let paragraph = [], list = null, table = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    if (list) blocks.push({ type: 'ul', items: list });
    if (table?.length) blocks.push({ type: 'table', rows: table });
    paragraph = []; list = null; table = null;
  };
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith('>')) { flush(); continue; }
    if (line.startsWith('# ')) { flush(); blocks.push({ type: 'h1', text: line.slice(2).trim() }); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ type: 'h2', text: line.slice(3).trim() }); continue; }
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
  return blocks;
}

/** One block as HTML. */
export function blockHtml(block) {
  if (block.type === 'h2') return `<h2>${inline(block.text)}</h2>`;
  if (block.type === 'p') return `<p>${inline(block.text)}</p>`;
  if (block.type === 'ul') return `<ul>${block.items.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`;
  if (block.type === 'table') return `<table><thead><tr>${block.rows[0].map(cell => `<th scope="col">${inline(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.slice(1)
    .map(row => `<tr>${row.map((cell, at) => (at ? `<td>${inline(cell)}</td>` : `<th scope="row">${inline(cell)}</th>`)).join('')}</tr>`).join('')}</tbody></table>`;
  return '';
}

/** { title, html } for one policy text, with [EFFECTIVE DATE] filled in. */
export function policyHtml(markdown, { effectiveDate }) {
  const blocks = policyBlocks(withEffectiveDate(markdown.replace(/\r\n?/g, '\n'), effectiveDate));
  return { title: blocks.find(block => block.type === 'h1')?.text || '', html: blocks.map(blockHtml).join('') };
}
