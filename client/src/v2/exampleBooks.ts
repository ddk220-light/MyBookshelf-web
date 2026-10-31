import type { PublicBook } from './types';

// Shared defaults for everyone. Keep the selection separate from the view so
// a future location-aware selection can use the same book-to-library flow.
// These are real editions, not availability fixtures; catalogs are checked live.
export const exampleBooks: ReadonlyArray<{ book: PublicBook; category: string; authorLabel: string }> = [
  {
    category: 'Novel',
    authorLabel: 'Paulo Coelho',
    book: { bookKey: 'v1:isbn:9780061122415', isbn13: '9780061122415', title: 'The Alchemist',
      authors: ['Paulo Coelho'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9780061122415-M.jpg?default=false' },
  },
  {
    category: 'Memoir',
    authorLabel: 'A. P. J. Abdul Kalam',
    book: { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', title: 'Wings of Fire',
      authors: ['A. P. J. Abdul Kalam', 'Arun Tiwari'], coverUrl: 'https://covers.openlibrary.org/b/isbn/9788173711466-M.jpg?default=false' },
  },
  {
    category: 'Computer science',
    authorLabel: 'Thomas H. Cormen et al.',
    book: { bookKey: 'v1:isbn:9780262033848', isbn13: '9780262033848', title: 'Introduction to Algorithms',
      authors: ['Thomas H. Cormen', 'Charles E. Leiserson', 'Ronald L. Rivest', 'Clifford Stein'],
      coverUrl: 'https://covers.openlibrary.org/b/id/11106524-M.jpg?default=false' },
  },
];
