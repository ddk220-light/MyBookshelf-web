// Reader-facing copy for the public web app. Keep complete messages together
// so navigation, empty states and catalog guidance can be translated later.
export const contentMessages = {
  startIntro: 'Books and stories you can read online today, at the site that hosts them. Nothing to borrow, no card needed. Reuse rights differ by item.',
  papersIntro: 'Search one paper source live, then read at the original host. Use Sources to choose another collection. Reuse rights differ by item.',
  loading: 'Results appear as each source answers. We stop waiting after 5 seconds.',
  unclear: 'They may be previews, loans or scans we couldn’t confirm. They’re left out of Free to read.',
  quotaTitle: 'Wide paper search is at today’s limit',
  quotaDetail: 'The source reports that its free allowance is exhausted. Choose another source or try again later.',
  sourceAccount: 'These books are free to read after signing in at the source.',
  rights: 'Free to read does not always mean free to reuse. Check your country’s rules and the source’s terms.',
  noHost: 'MyBookshelf doesn’t host or download the book.',
};
export const uiMessages = {
  skipToContent: 'Skip to content',
  openingLibraryLink: 'Opening your library…',
  libraryLinkMissing: 'This library link isn’t available. Please choose a library from the directory.',
  libraryLinkUnavailable: 'We couldn’t open this library link just now. Please try again.',
  publishedIn: (date: string) => `Published ${date}`,
  numberedVersion: (number: number) => `Version ${number}`,
  numberedCatalogRecord: (number: number) => `Record ${number}`,
  isbnVersion: (isbn: string) => `ISBN ${isbn}`,
  editionsGrouped: (count: number) => new Intl.NumberFormat('en').format(count) + ' editions',
  similarSpelling: 'Similar spelling',
  noCover: 'No cover',
} as const;
