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

const DERIVATIVE = /\b(summary|summaries|study guide|analysis of|workbook|exam prep|test prep|sparknotes|cliffs ?notes|classicnotes|gradesaver)\b/i;

// Ordering signals besides text. Text relevance alone decides which records
// match; these only reorder matches, and each is bounded so that it cannot
// outweigh a clearly better textual match (an exact title plus its author,
// or an exact title against a title that merely contains the words).
const POPULARITY_CAP = 220;
const LITERAL_BONUS = 40;
const literalText = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const SOURCE_ORDER_BONUS = 40;
// Reader logs are Open Library's strongest popularity signal; edition counts
// add a little. Both are log-scaled: 10 readers and 10,000 differ by 135.
export function popularityScore(book) {
  const readers = Number(book?.popularity?.readers), editions = Number(book?.editionCount);
  const value = 45 * Math.log10(1 + (Number.isFinite(readers) && readers > 0 ? readers : 0))
    + 15 * Math.log10(1 + (Number.isFinite(editions) && editions > 0 ? editions : 0));
  return Math.min(POPULARITY_CAP, value);
}

// The provider's own relevance order (per request), when it is known.
function sourceOrderScore(book) {
  const rank = book?.sourceRank;
  return Number.isInteger(rank) && rank >= 0 ? SOURCE_ORDER_BONUS / (1 + rank / 3) : 0;
}

// The title begins with the query's words in order: a series or subtitled
// title ("Harry Potter and the Philosopher's Stone" for "harry potter").
function startsWithQuery(query, words, spelling) {
  return words.length > query.length && query.every((word, index) => wordCost(word, words[index], spelling) === 0);
}

export function rankSearchResults(books, { title, author = '', max = 10, authorIntent: namesAuthor = false }, spelling = false) {
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
    // When the search names an author (decided from the returned records),
    // that author's own works come before books about them.
    // Anthologies listing dozens of contributors are not the author's own work.
    const byNamedAuthor = namesAuthor && (Array.isArray(book.authors) ? book.authors.length : 1) <= 3
      && authors.some(name => coverage(query, searchWords(name), false) === 0);
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
      // Title words plus the author's name: the strongest evidence for one
      // book. Its margin over a title that merely contains the words exceeds
      // the largest popularity and source-order bonus. Lone initials ("c" in
      // "let us c") are not evidence of an author, and neither is a split that
      // needs a spelling correction ("harry poter" is not Harry Sidebottom's
      // "Il prezzo del potere").
      const titleAndAuthor = mixedCost === 0 && titleCost > 2 && nameCost > 2
        && query.some(word => [...word].length > 1 && !Number.isFinite(coverage([word], words, spelling)));
      const basis = authorQuery.length ? 1200 : byNamedAuthor ? 1400 : titleAndAuthor ? 1380 : sameAuthor && query.length > 1 ? 1350
        : sameTitle ? 1300 : startsWithQuery(query, words, spelling) ? 1250
          : titleCost === 0 ? 1100 : nameCost === 0 ? 1150 : 1000;
      // Prefer the book itself to long titles that merely contain its name.
      // The title's other words say nothing against an author's own work.
      const excess = byNamedAuthor ? 0 : words.filter(word => !query.some(expected => wordCost(expected, word, spelling) <= 2)).length;
      // Words alone cannot tell "Let Us C" from "Let Us C++": a title equal to
      // the typed text, symbols included, is the closer match.
      const literal = !authorQuery.length && literalText(variant) === literalText(title) ? LITERAL_BONUS : 0;
      const score = basis + literal + (variant === book.title ? 30 : 0) - edits * 90 - Math.min(150, excess * 12);
      if (!best || score > best.score) best = { score, edits, variant };
    }
    if (best) {
      // The record keeps its own title when that title matches the query by
      // itself, within the bounded spelling tolerance even on the strict pass
      // ("the hobit" shows "The Hobbit", not the transliterated alias
      // "Hobiṭ"). Otherwise it is presented under the matched alternate or
      // edition title, in the reader's words ("The Alchemist" for Coelho's
      // "O Alquimista"); see presentTitles for series names.
      const own = /\b(adaptation|abridged|graphic novel)\b/i.test(book.title)
        || coverage(query, [...searchWords(book.title), ...authorTokens], true) <= 2;
      ranked.push({ book: { ...book, title: own ? book.title : best.variant,
        ...(best.edits ? { searchMatch: 'spelling' } : {}) }, ownTitle: book.title, score: best.score + popularityScore(book) + sourceOrderScore(book) });
    }
  }
  ranked.sort((a, b) => b.score - a.score || (b.book.editionCount || 0) - (a.book.editionCount || 0));
  // Deduplication is by an authoritative identity, never by fuzzy title text.
  const seen = new Set();
  return presentTitles(ranked.filter(({ book }) => {
    const key = book.bookKey || book.workId || book.isbn || book.isbn13 || book.source_id;
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  }), title).slice(0, max).map(({ book }) => book);
}

// Letters' scripts, for telling a reader's-language alias from a title in
// another script ("鋼の錬金術師 1" for "Fullmetal Alchemist 1").
const SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil',
  'Telugu', 'Kannada', 'Malayalam', 'Sinhala', 'Thai', 'Hangul', 'Han', 'Hiragana', 'Katakana', 'Georgian', 'Armenian', 'Ethiopic']
  .map(name => [name, new RegExp(`\\p{Script=${name}}`, 'u')]);
function scriptsOf(value) {
  const text = String(value || '');
  return new Set(SCRIPTS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
}
const sharesScript = (left, right) => [...left].some(name => right.has(name));

// A matched title that stands in for several works with different own titles
// is a series or collective name, not each book's title: Open Library lists
// "Wings of Fire" as an alternate title of "The Dragonet Prophecy", "The Lost
// Heir", "Darkstalker"… Those records show their own titles again, so they
// are distinguishable and are not displayed as one book. An alias used for a
// single work (or for duplicate records of one title, such as Coelho's "O
// Alquimista") stays: it is the title readers search for. Own titles in
// another script than the query keep the alias.
function presentTitles(ranked, query) {
  const key = value => searchWords(value).join(' ');
  const owners = new Map();
  for (const entry of ranked) {
    if (entry.book.title === entry.ownTitle) continue;
    const alias = key(entry.book.title);
    owners.set(alias, new Set([...(owners.get(alias) || []), key(entry.ownTitle)]));
  }
  const reference = scriptsOf(query).size ? scriptsOf(query) : null;
  return ranked.map(entry => {
    if (entry.book.title === entry.ownTitle || (owners.get(key(entry.book.title))?.size || 0) < 2) return entry;
    if (!sharesScript(scriptsOf(entry.ownTitle), reference || scriptsOf(entry.book.title))) return entry;
    return { ...entry, book: { ...entry.book, title: entry.ownTitle } };
  });
}

// Decide from returned records, not from a list of names, whether a free-text
// search names an author. Evidence: several returned works by one author
// whose name contains every query word (and little else), at least as many as
// the works whose titles contain the query. Returns that author's name.
export function authorIntent(books, { title, author = '' }, { minWorks = 3, majority = true } = {}) {
  const query = searchWords(title);
  if (author || !query.length || query.some(word => /^\d+$/.test(word))) return null;
  const byAuthor = new Map(), seen = new Set();
  let titled = 0;
  for (const book of books) {
    const key = book?.workId || book?.bookKey || book?.source_id;
    if (!book?.title || (key && seen.has(key))) continue;
    if (key) seen.add(key);
    if ([book.title, ...(book.searchTitles || [])].some(variant => coverage(query, searchWords(variant), false) === 0)) titled++;
    const names = [...(Array.isArray(book.authors) ? book.authors : [book.author]), ...(book.searchAuthors || [])].filter(Boolean);
    const named = new Set(names.map(searchWords)
      .filter(words => words.length <= query.length + 1 && coverage(query, words, false) === 0).map(words => [...words].sort().join(' ')));
    for (const name of named) byAuthor.set(name, (byAuthor.get(name) || 0) + 1);
  }
  const [name, works] = [...byAuthor].sort((a, b) => b[1] - a[1])[0] || [];
  return name && works >= minWorks && (!majority || works >= titled) ? name : null;
}
