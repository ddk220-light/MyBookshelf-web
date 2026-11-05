import type { ContentItem, ContentSourceStatus } from '../../contentTypes';

export const sourceNames: Record<string, string> = {
  gdl:'Global Digital Library',librivox:'LibriVox',loc:'Library of Congress',bhl:'Biodiversity Heritage Library','african-minds':'African Minds','lse-press':'LSE Press','mattering-press':'Mattering Press','mediastudies-press':'mediastudies.press','punctum-books':'punctum books','python-docs':'Python documentation',
  bookdash: 'Book Dash', gutenberg: 'Project Gutenberg', 'open-textbook-library': 'Open Textbook Library',
  europepmc: 'Europe PMC', doaj: 'DOAJ', arxiv: 'arXiv', openalex: 'Wide paper search',
  'children-pilot': 'Reviewed children’s starter set', storyweaver: 'StoryWeaver',
};
export const formatNames: Record<string, string> = {
  'application/pdf': 'PDF', 'application/epub+zip': 'EPUB', 'text/plain': 'Plain text',
  'text/html': 'HTML', 'application/x-mobipocket-ebook': 'Kindle',
};
export function primaryReadingAction(item: ContentItem) {
  const anonymous = item.readingActions.filter(action => !action.requiresAccount);
  const choices = anonymous.length ? anonymous : item.readingActions;
  return choices.find(action => item.locations.find(location => location.id === action.locationId)?.readerUrl) || choices[0];
}
export function sourceName(source: ContentSourceStatus) { return sourceNames[source.id] || source.name || source.id; }
export function sourceStatus(source: ContentSourceStatus) {
  if(source.status==='disabled'&&safeSource(source.searchUrl))return 'Search on source website';
  return ({ ok: `${source.returned} shown`, empty: '0 shown', searching: 'Searching…', disabled: 'Not connected yet',
    not_selected: 'Not searched this time', queued: 'Waiting its turn', timeout: 'Timed out', throttled: 'Please try later',
    quota_exhausted: 'At today’s limit', unavailable: 'Could not answer', unsupported: 'Filter not supported',
  } as Record<string, string>)[source.status] || 'Could not answer';
}
export function checkedWhen(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'time not supplied';
  const hours = Math.max(0, (Date.now() - Date.parse(value)) / 3600000);
  return hours < 1 ? 'just now' : hours < 24 ? `${Math.floor(hours)} ${Math.floor(hours) === 1 ? 'hour' : 'hours'} ago`
    : new Date(value).toLocaleDateString();
}
export function safeSource(value?: string) {
  try { const url = new URL(value || ''); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
