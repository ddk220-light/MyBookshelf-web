// Search relevance is separate from work/edition identity. A spelling match
// may suggest a book; it must never combine its ISBNs with another work.
const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'of', 'to', 'in', 'on', 'for', 'by', 'with', 'dr', 'prof']);
export function searchWords(value) {
  const words = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/['’]/g, '').match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  const meaningful = words.filter(word => !STOP_WORDS.has(word));
  return [...new Set(meaningful.length ? meaningful : words)];
}

export function scopedSearchQuery({ title, author = '' }, spelling = false) {
  const term = word => word + (spelling && [...word].length >= 4 && !/^\d+$/.test(word) ? '~2' : '');
  const titleWords = searchWords(title), authorWords = searchWords(author);
  if (spelling) {
    const words = [...titleWords, ...authorWords];
    const terms = words.flatMap(word => [word, term(word)]);
    // An adjacent swap can be lost to the provider's stemming before fuzzy
    // matching. For a single-word query, include bounded swap alternatives.
    if (words.length === 1 && words[0].length >= 4 && words[0].length <= 20 && !/^\d+$/.test(words[0])) {
      const letters = [...words[0]];
      for (let i = 0; i < letters.length - 1; i++) {
        const swapped = [...letters]; [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
        terms.push(swapped.join(''));
      }
    }
    // Recover candidates from remaining correct keywords; local validation
    // still requires every input word with no more than two small edits total.
    return [...new Set(terms)].map(word => `(title:${word} OR author:${word} OR author_alternative_name:${word})`).join(' OR ');
  }
  if (authorWords.length) {
    return [titleWords.length && `title:(${titleWords.map(term).join(' AND ')})`,
      `(author:(${authorWords.map(term).join(' AND ')}) OR author_alternative_name:(${authorWords.map(term).join(' AND ')}))`].filter(Boolean).join(' AND ');
  }
  if (!titleWords.length) return '';
  // The same box accepts a title, author, or both. Every significant word must
  // occur in those bibliographic fields, not just in subjects or descriptions.
  const words = titleWords.map(term);
  return words.map(word => `(title:${word} OR author:${word} OR author_alternative_name:${word})`).join(' AND ');
}

export function prefixSearchQuery({ title, author = '' }) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const prefix = word => {
    const letters = [...segmenter.segment(word)].map(item => item.segment);
    // Preserve complete vowel signs in scripts such as Tamil. Short words and
    // numbers stay exact; every word must still occur in the retrieved record.
    const length = /^[a-z]+$/.test(word) ? 3 : 2;
    return !/^\d+$/.test(word) && letters.length > length + 1 ? `${letters.slice(0, length).join('')}*` : word;
  };
  return [...searchWords(title), ...searchWords(author)].map(prefix)
    .map(word => `(title:${word} OR author:${word} OR author_alternative_name:${word})`).join(' AND ');
}

// Optimal-string-alignment distance counts a swapped adjacent pair as one
// typo. Solr retrieves with ~2 because its analyzer may count that swap as two.
function distance(left, right) {
  const a = [...left], b = [...right];
  if (Math.abs(a.length - b.length) > 2) return 3;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

function wordCost(query, actual, spelling) {
  if (query === actual) return 0;
  // Match ordinary plural/possessive keyword forms without calling them typos.
  const singular = word => /^[a-z]{4,}[^sui]s$/.test(word) ? word.slice(0, -1) : word;
  if (singular(query) === singular(actual)) return 0;
  if (!spelling || query.length < 4 || actual.length < 3 || /^\d+$/.test(query) || /^\d+$/.test(actual)) return Infinity;
  const edits = distance(query, actual);
  return edits <= (query.length >= 6 ? 2 : 1) ? edits : Infinity;
}

function coverage(query, words, spelling) {
  return query.reduce((sum, word) => sum + Math.min(Infinity, ...words.map(actual => wordCost(word, actual, spelling))), 0);
}

const DERIVATIVE = /\b(summary|summaries|study guide|analysis of|workbook|exam prep|test prep)\b/i;

export function rankSearchResults(books, { title, author = '', max = 10 }, spelling = false) {
  const query = searchWords(title), authorQuery = searchWords(author);
  const askedForDerivative = DERIVATIVE.test(`${title} ${author}`);
  const ranked = [];
  for (const book of books) {
    if (!book?.title) continue;
    if (!askedForDerivative && DERIVATIVE.test(book.title)) continue;
    const authors = [...(Array.isArray(book.authors) ? book.authors : [book.author]), ...(book.searchAuthors || [])].filter(Boolean);
    const authorTokens = [...new Set(authors.flatMap(searchWords))];
    const authorCost = coverage(authorQuery, authorTokens, spelling);
    if (authorCost > 2) continue;
    const variants = [...new Set([book.title, ...(book.searchTitles || [])].filter(Boolean))];
    let best;
    for (const variant of variants) {
      if (!askedForDerivative && DERIVATIVE.test(variant)) continue;
      const words = searchWords(variant);
      // A year in an author's dates is not evidence for a numeric book title.
      if (query.some(word => /^\d+$/.test(word) && !words.includes(word))) continue;
      const titleCost = coverage(query, words, spelling);
      const nameCost = coverage(query, authorTokens, spelling);
      const mixedCost = coverage(query, [...words, ...authorTokens], spelling);
      const edits = authorCost + (authorQuery.length ? titleCost : mixedCost);
      if (!Number.isFinite(edits) || edits > 2 || (!query.length && !authorQuery.length)) continue;
      const sameTitle = words.length === query.length && titleCost === 0;
      const sameAuthor = authors.some(name => searchWords(name).join(' ') === query.join(' '));
      const basis = authorQuery.length ? 1200 : sameAuthor && query.length > 1 ? 1350
        : sameTitle ? 1300 : titleCost > 2 && nameCost > 2 ? 1320 : titleCost === 0 ? 1100 : nameCost === 0 ? 1150 : 1000;
      // Prefer the book itself to long titles that merely contain its name.
      const excess = words.filter(word => !query.some(expected => wordCost(expected, word, spelling) <= 2)).length;
      const score = basis + (variant === book.title ? 30 : 0) - edits * 90 - Math.min(150, excess * 12);
      if (!best || score > best.score) best = { score, edits, variant };
    }
    if (best) ranked.push({ book: { ...book,
      title: /\b(adaptation|abridged|graphic novel)\b/i.test(book.title)
        || coverage(query, [...searchWords(book.title), ...authorTokens], spelling) <= 2 ? book.title : best.variant,
      ...(best.edits ? { searchMatch: 'spelling' } : {}) }, score: best.score });
  }
  ranked.sort((a, b) => b.score - a.score || (b.book.editionCount || 0) - (a.book.editionCount || 0));
  // Deduplication is by an authoritative identity, never by fuzzy title text.
  const seen = new Set();
  return ranked.filter(({ book }) => {
    const key = book.bookKey || book.workId || book.isbn || book.isbn13 || book.source_id;
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  }).slice(0, max).map(({ book }) => book);
}
