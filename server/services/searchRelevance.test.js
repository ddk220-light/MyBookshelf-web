import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSearchResults, scopedSearchQuery, prefixSearchQuery, searchWords } from './searchRelevance.js';

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
