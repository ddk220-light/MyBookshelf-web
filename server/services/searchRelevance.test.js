import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSearchResults, scopedSearchQuery, prefixSearchQuery, searchWords, authorIntent, popularityScore } from './searchRelevance.js';

const book = (title, author, id = title) => ({ title, authors: [author], workId: id });
const find = (books, title, spelling = false) => rankSearchResults(books, { title, max: 10 }, spelling);

test('the reported title excludes broad topic matches and other reasoning books', () => {
  const right = book('A Modern Approach To Logical Reasoning', 'Dr. R S Aggarwal');
  const books = [book('Artificial intelligence: A Modern Approach', 'Stuart Russell'), book('The death of Christ', 'James Denney'),
    book('Ruminations', 'Avi Sion'), book('Modern approach to verbal and non-verbal reasoning', 'R. S. Aggarwal'), right];
  assert.deepEqual(find(books, 'Modern approach to logical reasoning'), [right]);
  assert.deepEqual(find(books, 'Modern approach to logical reasoning', true), [right]);
});

test('title keywords, mixed authors, and author-only searches retain the intended identities', () => {
  const kalam = book('Wings of Fire', 'A. P. J. Abdul Kalam', 'kalam');
  const dragon = book('Wings of Fire', 'Tui T. Sutherland', 'dragon');
  assert.deepEqual(find([dragon, kalam], 'wings fire Kalam'), [kalam]);
  assert.deepEqual(find([dragon, kalam], 'Abdul Kalam'), [kalam]);
  assert.equal(find([dragon, kalam], 'Wings of Fire').length, 2);
  assert.deepEqual(rankSearchResults([kalam, dragon], { title: 'Wings of Fire', author: 'Sutherland', max: 10 }), [dragon]);
});

test('a small typo is suggested explicitly and cannot establish work equivalence', () => {
  const pride = book('Pride and Prejudice', 'Jane Austen');
  assert.deepEqual(find([pride], 'prdie prejudice austen'), []);
  assert.deepEqual(find([pride], 'prdie prejudice austen', true), [{ ...pride, searchMatch: 'spelling' }]);
  assert.equal(find([book('Harry Potter', 'Rowling')], 'hary poter', true)[0].searchMatch, 'spelling');
  assert.deepEqual(find([book('Dune', 'Frank Herbert')], 'Gone', true), []);
  assert.deepEqual(find([book('1984', 'George Orwell')], '1985', true), []);
  assert.deepEqual(find([pride], 'prdie prejdice austne', true), []);
});

test('does not fill results with summaries and guides unless requested', () => {
  const original = book('Atomic Habits', 'James Clear');
  const summary = book('Summary of Atomic Habits by James Clear', 'Study Press');
  assert.deepEqual(find([summary, original], 'atomic habits'), [original]);
  assert.deepEqual(find([summary, original], 'summary atomic habits'), [summary]);
});

test('matching edition titles are searchable without borrowing an arbitrary edition ISBN', () => {
  const work = { ...book('Преступление и наказание', 'Fyodor Dostoevsky'), searchTitles: ['Crime and Punishment'] };
  const result = find([work], 'crime punishment dostoevsky');
  assert.equal(result[0].title, 'Crime and Punishment');
  assert.equal(result[0].workId, work.workId);
  assert.equal(result[0].isbn, undefined);
});

test('a title plus its author ranks the original above books about it', () => {
  const original = book('The White Tiger', 'Aravind Adiga');
  const criticism = book("Aravind Adiga's The White Tiger", 'Sudhir Arora');
  assert.equal(find([criticism, original], 'white tiger adiga')[0].workId, original.workId);
  assert.equal(find([book('White Tiger Adiga', 'Literary Critic'), original], 'white tiger adiga')[0].workId, original.workId);
});

test('short title keywords retain longer original titles alongside exact names', () => {
  const gandhi = book('The Story of My Experiments with Truth', 'Mahatma Gandhi');
  const sameKeywords = book('Experiments With Truth', 'Mark Nash');
  assert.ok(find([sameKeywords, gandhi], 'experiments truth').some(result => result.workId === gandhi.workId));
});

test('known author aliases support transliteration without changing the displayed author', () => {
  const original = { ...book('War and Peace', 'Лев Толстой'), searchAuthors: ['Leo Tolstoy'] };
  assert.deepEqual(find([original], 'war peace tolstoy'), [original]);
  assert.deepEqual(find([original], 'Leo Tolstoy'), [original]);
  assert.deepEqual(find([original], 'war peace dostoevsky'), []);
});

test('possessive title keywords are not mislabelled as spelling corrections', () => {
  const original = { ...book("Harry Potter and the Philosopher's Stone", 'J. K. Rowling'), editionCount: 100 };
  assert.deepEqual(find([original], 'harry potter philosopher stone'), [original]);
  const poorRecord = book('Harry Potter and the Philosopher stone', 'JK Rolling');
  assert.equal(find([poorRecord, original], 'harry potter philosopher stone')[0].workId, original.workId);
});

test('normalization handles punctuation and Latin accents without erasing Tamil vowel signs', () => {
  assert.deepEqual(searchWords('García Márquez'), ['garcia', 'marquez']);
  assert.deepEqual(searchWords('திருக்குறள்'), ['திருக்குறள்']);
  assert.equal(find([book("The Hitchhiker’s Guide to the Galaxy", 'Douglas Adams')], 'hitchhikers galaxy')[0].authors[0], 'Douglas Adams');
});

test('field-scoped queries treat typed operators as text and bound typo matching', () => {
  const query = scopedSearchQuery({ title: 'modern approach logical reasoning' });
  assert.match(query, /title:modern OR author:modern/);
  assert.doesNotMatch(query, /subject:|description:/);
  const typedSyntax = scopedSearchQuery({ title: 'title:* OR author:secret' });
  assert.doesNotMatch(typedSyntax, /\*/);
  assert.deepEqual(find([book('Any title', 'secret')], 'title:* OR author:secret'), []);
  assert.match(scopedSearchQuery({ title: '1984 orwel' }, true), /title:1984 OR author:1984/);
  assert.match(scopedSearchQuery({ title: '1984 orwel' }, true), /orwel~2/);
  assert.match(prefixSearchQuery({ title: 'guide narayn' }), /title:gui\*/);
  assert.match(prefixSearchQuery({ title: 'திருகுறள்' }), /title:திரு\*/);
});

test('numeric dates in an author alias are not book title matches', () => {
  const unrelated = { ...book('Collected Works', 'An Author'), searchAuthors: ['An Author (1984–)'] };
  assert.deepEqual(find([unrelated], '1984'), []);
});

test('alternate titles do not hide adaptation qualifiers; edition count breaks relevance ties', () => {
  const original = { ...book('Nineteen Eighty-Four', 'George Orwell', 'original'), searchTitles: ['1984'], editionCount: 100 };
  const adaptation = { ...book('1984 (adaptation)', 'George Orwell', 'adapted'), searchTitles: ['1984'], editionCount: 2 };
  const results = find([adaptation, original], '1984');
  assert.equal(results[0].workId, 'original');
  assert.equal(results[1].title, '1984 (adaptation)');
});

test('a broad series alias does not erase volume subtitles or outrank an exact title', () => {
  const novel = { ...book('Wings of Fire: The Dark Secret', 'Tui T. Sutherland', 'dragon'), searchTitles: ['Wings of Fire'], editionCount: 100 };
  const autobiography = { ...book('Wings of Fire', 'A. P. J. Abdul Kalam', 'kalam'), editionCount: 9 };
  const results = find([novel, autobiography], 'Wings of Fire');
  assert.equal(results[0].workId, 'kalam');
  assert.equal(results[1].title, novel.title);
});

const popular = (title, author, readers, editionCount, id = title) => ({ ...book(title, author, id), popularity: { readers }, editionCount });

test('reader popularity lifts the famous series book above obscure exact-title records', () => {
  const stone = popular("Harry Potter and the Philosopher's Stone", 'J. K. Rowling', 24733, 400, 'stone');
  const guide = popular('Harry Potter', 'Jody Revenson', 18, 1, 'guide');
  const calendar = popular('Harry Potter', 'Cedco Publishing', 9, 1, 'calendar');
  const results = find([guide, calendar, stone], 'harry potter');
  assert.deepEqual(results.map(result => result.workId), ['stone', 'guide', 'calendar']);
});

test('popularity cannot bury an exact title and author match or admit a non-matching book', () => {
  const play = book('The Alchemist', 'Ben Jonson', 'play');
  const famous = { ...popular("Ben Jonson's The Alchemist and Other Plays", 'A Critic', 1_000_000, 5000, 'famous'), sourceRank: 0 };
  assert.equal(find([famous, play], 'the alchemist ben jonson')[0].workId, 'play');
  const novel = { ...popular('O Alquimista', 'Paulo Coelho', 10197, 141, 'novel'), searchTitles: ['The Alchemist'] };
  const jonson = popular('The Alchemist, 1612', 'Ben Jonson', 739, 200, 'jonson');
  const unrelated = popular('The Pilgrimage', 'Paulo Coelho', 50_000, 300, 'pilgrimage');
  assert.deepEqual(find([jonson, unrelated, novel], 'the alchemist').map(result => result.workId), ['novel', 'jonson']);
  assert.ok(popularityScore({ popularity: { readers: 1e9 }, editionCount: 1e9 }) <= 220);
});

test('records without popularity keep the text order, with the source order as a bounded tie-break', () => {
  const exact = { title: 'Wings of Fire', author: 'A. P. J. Abdul Kalam', source_id: 'google-2', sourceRank: 2 };
  const longer = { title: 'Wings of Fire: An Autobiography Study', author: 'A. P. J. Abdul Kalam', source_id: 'google-0', sourceRank: 0 };
  assert.deepEqual(find([longer, exact], 'wings of fire').map(result => result.source_id), ['google-2', 'google-0']);
  const catalog = [book('Wings of Fire', 'A. P. J. Abdul Kalam', 'b'), book('Wings of Fire', 'A. P. J. Abdul Kalam', 'a')];
  assert.deepEqual(find(catalog, 'wings of fire').map(result => result.workId), ['b', 'a']);
});

test('author intent comes from returned works by one author, not from a list of names', () => {
  const narayan = ['Malgudi Days', 'Swami and Friends', 'The Guide'].map(title => ({ ...book(title, 'Rasipuram Krishnaswamy Narayan'), searchAuthors: ['R. K. Narayan'] }));
  const about = book('R. K. Narayan', 'William Walsh', 'about');
  assert.ok(authorIntent([about, ...narayan], { title: 'r k narayan' }));
  assert.equal(authorIntent([about, narayan[0]], { title: 'r k narayan' }), null);
  assert.equal(authorIntent([book('Harry Potter', 'Harry Potter Fan'), ...Array.from({ length: 4 }, (_, index) => book(`Harry Potter ${index}`, 'J. K. Rowling', `hp${index}`))], { title: 'harry potter' }), null);
  assert.equal(authorIntent(narayan, { title: 'r k narayan', author: 'narayan' }), null);
  const ranked = rankSearchResults([about, { ...narayan[2], popularity: { readers: 65 } }, { ...narayan[0], popularity: { readers: 199 } }],
    { title: 'r k narayan', max: 10, authorIntent: true });
  assert.deepEqual(ranked.map(result => result.title), ['Malgudi Days', 'The Guide', 'R. K. Narayan']);
});

test('study-guide brands are derivative works unless requested', () => {
  const original = popular('Nineteen Eighty-Four', 'George Orwell', 9059, 727, 'orwell');
  const guide = book('SparkNotes for 1984 by George Orwell', 'SparkNotes', 'guide');
  assert.deepEqual(find([guide, { ...original, searchTitles: ['1984'] }], '1984').map(result => result.workId), ['orwell']);
  assert.deepEqual(find([guide], 'sparknotes 1984').map(result => result.workId), ['guide']);
});

test('a title-plus-author split that needs a spelling correction is not the strongest tier', () => {
  const stone = { ...book("Harry Potter and the Philosopher's Stone", 'J. K. Rowling', 'OL82563W'), popularity: { readers: 24733 }, editionCount: 400 };
  const other = book('Il prezzo del potere. Il trono di Cesare', 'Harry Sidebottom', 'OL33736414W');
  assert.deepEqual(find([other, stone], 'harry poter', true).map(item => item.workId), ['OL82563W', 'OL33736414W']);
  // Exact title plus author words keep the tier.
  const jonson = book('The Alchemist', 'Ben Jonson', 'OL2W');
  const coelho = { ...book('The Alchemist', 'Paulo Coelho', 'OL3W'), popularity: { readers: 30000 }, editionCount: 300 };
  assert.equal(find([coelho, jonson], 'the alchemist ben jonson')[0].workId, 'OL2W');
});

test('a title equal to the typed text, symbols included, wins a tie of words', () => {
  const plus = { ...book('Let Us C++', 'Yashavant Kanetkar', 'OL9086929W'), popularity: { readers: 130 }, editionCount: 4, sourceRank: 0 };
  const plain = { ...book('Let us C', 'Yashavant P. Kanetkar', 'OL17734885W'), popularity: { readers: 167 }, editionCount: 1, sourceRank: 2 };
  assert.equal(find([plus, plain], 'let us c')[0].workId, 'OL17734885W');
  assert.equal(find([plain, plus], 'Let Us C++')[0].workId, 'OL9086929W');
  // It stays below the popularity margin that lifts a famous series book.
  const stone = { ...book("Harry Potter and the Philosopher's Stone", 'J. K. Rowling', 'OL82563W'), popularity: { readers: 24733 }, editionCount: 400 };
  assert.equal(find([book('Harry Potter', 'Jody Revenson', 'OL1W'), stone], 'harry potter')[0].workId, 'OL82563W');
});

test('a series name matched for several works gives way to each work’s own title', () => {
  const kalam = { ...book('Wings of Fire', 'A. P. J. Abdul Kalam', 'OL1037811W'), editionCount: 9 };
  const volumes = ['The Dragonet Prophecy', 'The Lost Heir', 'Darkstalker'].map((title, index) =>
    ({ ...book(title, 'Tui T. Sutherland', `OL${index + 10}W`), searchTitles: [index ? 'Wings of Fire' : 'Wings Of Fire'], editionCount: 20 }));
  const results = find([...volumes, kalam], 'wings of fire');
  assert.equal(results[0].workId, 'OL1037811W');
  assert.deepEqual(results.slice(1).map(result => result.title).sort(), ['Darkstalker', 'The Dragonet Prophecy', 'The Lost Heir']);
  // Duplicate records of one translated work keep the title readers search for.
  const alquimista = { ...book('O Alquimista', 'Paulo Coelho', 'OL796465W'), searchTitles: ['The Alchemist'], editionCount: 141 };
  const duplicate = { ...book('The Alchemist', 'Paulo Coelho', 'OL42974242W'), editionCount: 1 };
  const copy = { ...book('O Alquimista', 'Paulo Coelho', 'OL5W'), searchTitles: ['The Alchemist'], editionCount: 1 };
  assert.deepEqual(find([alquimista, duplicate, copy], 'the alchemist').map(result => result.title), ['The Alchemist', 'The Alchemist', 'The Alchemist']);
  // Own titles in another script than the query keep the reader's alias.
  const manga = [1, 2].map(number => ({ ...book(`鋼の錬金術師 ${number}`, '荒川弘', `OL${number + 20}W`), searchTitles: ['Fullmetal Alchemist'] }));
  assert.deepEqual(find(manga, 'fullmetal alchemist').map(result => result.title), ['Fullmetal Alchemist', 'Fullmetal Alchemist']);
});

test('a work title within the spelling tolerance is shown instead of a transliterated alias', () => {
  const hobbit = { ...book('The Hobbit', 'J.R.R. Tolkien', 'OL262758W'), searchTitles: ['Hobiṭ', 'Hobit'], editionCount: 500 };
  for (const query of ['the hobit', 'the hobbit']) assert.equal(find([hobbit], query)[0].title, 'The Hobbit');
  assert.equal(find([hobbit], 'the hobit', true)[0].title, 'The Hobbit');
  // A record whose own title is far from the query still shows the matched title.
  const orwell = { ...book('Nineteen Eighty-Four', 'George Orwell', 'OL1168083W'), searchTitles: ['1984'] };
  assert.equal(find([orwell], '1984')[0].title, '1984');
  // Hobiṭ alone: the plain own title still wins over a marked alias.
  const marked = { ...hobbit, searchTitles: ['Hobiṭ'] };
  assert.equal(find([marked], 'the hobit', true)[0].title, 'The Hobbit');
});

test('an exact plain-Latin title is shown instead of a marked transliteration within the tolerance', () => {
  const godana = { ...book('Godāna', 'Munshi Premchand', 'OL332076W'), searchTitles: ['Godan', 'गोदान'] };
  assert.equal(find([godana], 'godan')[0].title, 'Godan');
  assert.equal(find([godana], 'godan', true)[0].title, 'Godan');
  assert.equal(find([godana], 'godāna')[0].title, 'Godāna');
  assert.equal(find([godana], 'गोदान')[0].title, 'गोदान');
});
