import { Fragment, type ReactNode } from 'react';

// Renders the owner-approved policy drafts (docs/policy/*.md) without changing
// their words. Only the small Markdown subset those files use is understood:
// "# " and "## " headings, paragraphs, "- " lists, pipe tables, **bold** and
// plain email addresses. The leading "> Draft ..." review note is a note for
// reviewers, not policy text, and is left out. Placeholders such as
// [EFFECTIVE DATE] stay visible unless the build supplies a value.

export type PolicyBlock =
  | { type: 'h1' | 'h2' | 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] };

export function parsePolicy(markdown: string, values: Record<string, string | null> = {}): PolicyBlock[] {
  let text = markdown.replace(/\r\n?/g, '\n');
  for (const [placeholder, value] of Object.entries(values)) if (value) text = text.split(placeholder).join(value);
  const blocks: PolicyBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  let table: string[][] | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    if (list) blocks.push({ type: 'ul', items: list });
    if (table?.length) blocks.push({ type: 'table', head: table[0], rows: table.slice(1) });
    paragraph = []; list = null; table = null;
  };
  for (const raw of text.split('\n')) {
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
    if (line.startsWith('- ')) {
      if (!list) { flush(); list = []; }
      list.push(line.slice(2).trim());
      continue;
    }
    if (list && /^\s+\S/.test(raw)) { list[list.length - 1] += ' ' + line.trim(); continue; }
    if (list || table) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
}

const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

/** **bold** and email addresses (as mailto links); everything else is plain text. */
export function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <Fragment key={index}>{part.split(EMAIL).map((piece, at) => at % 2 ? <a key={at} href={'mailto:' + piece}>{piece}</a> : piece)}</Fragment>;
  });
}

export function PolicyBlocks({ blocks, idPrefix }: { blocks: PolicyBlock[]; idPrefix: string }) {
  return <>{blocks.map((block, index) => {
    switch (block.type) {
      case 'h1': return null;
      case 'h2': return <h2 key={index} id={idPrefix + '-' + index}>{inline(block.text)}</h2>;
      case 'p': return <p key={index}>{inline(block.text)}</p>;
      case 'ul': return <ul key={index}>{block.items.map((item, at) => <li key={at}>{inline(item)}</li>)}</ul>;
      case 'table': return <table key={index}>
        <thead><tr>{block.head.map((cell, at) => <th key={at} scope="col">{inline(cell)}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, at) => <tr key={at}>{row.map((cell, cellAt) => cellAt === 0 ? <th key={cellAt} scope="row">{inline(cell)}</th> : <td key={cellAt}>{inline(cell)}</td>)}</tr>)}</tbody>
      </table>;
    }
  })}</>;
}

/**
 * Splits a parsed text into its title, the lines before the first "## "
 * heading, and one section per heading (the Privacy board's rows).
 */
export function policySections(blocks: PolicyBlock[]) {
  const title = blocks.find(block => block.type === 'h1');
  const intro: PolicyBlock[] = [];
  const sections: Array<{ heading: string; blocks: PolicyBlock[] }> = [];
  for (const block of blocks) {
    if (block.type === 'h1') continue;
    if (block.type === 'h2') sections.push({ heading: block.text, blocks: [] });
    else (sections.length ? sections[sections.length - 1].blocks : intro).push(block);
  }
  return { title: title && title.type === 'h1' ? title.text : '', intro, sections };
}
