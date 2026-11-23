// Small, shared formatting for counts and catalog dates. The interface copy is
// English, so numbers use English grouping regardless of the browser locale:
// "6,700 libraries", never "6 700 libraries" inside an English sentence.
const numbers = new Intl.NumberFormat('en');

export function formatCount(value: number): string {
  return numbers.format(value);
}

/** "1 library", "6,700 libraries". */
export function countOf(value: number, one: string, many: string): string {
  return `${formatCount(value)} ${value === 1 ? one : many}`;
}

const fullDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const monthDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' });

/**
 * Catalog publication dates arrive as a year, a year and month, a full ISO
 * date, an uncertain year ("1937?") or free text. Only the recognised shapes
 * are reformatted; anything else is shown as the catalog supplied it.
 */
export function formatPublishedDate(value: string): string {
  const text = value.trim();
  const uncertain = /^(\d{4})\?$/.exec(text);
  if (uncertain) return `c. ${uncertain[1]}`;
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(text);
  if (!match) return text;
  const [, year, month, day] = match;
  const monthNumber = Number(month), dayNumber = Number(day);
  if (!month || monthNumber < 1 || monthNumber > 12) return year;
  if (!day || dayNumber < 1 || dayNumber > 31) return monthDate.format(new Date(Date.UTC(Number(year), monthNumber - 1, 1)));
  const date = new Date(Date.UTC(Number(year), monthNumber - 1, dayNumber));
  // 31 February and similar roll over to another month; keep the month only.
  return date.getUTCMonth() === monthNumber - 1 ? fullDate.format(date) : monthDate.format(new Date(Date.UTC(Number(year), monthNumber - 1, 1)));
}

// Display names for MARC language codes used by book records.
export function languageName(code: string): string {
  const names: Record<string, string> = { eng: 'English', hin: 'Hindi', tam: 'Tamil', mal: 'Malayalam', kan: 'Kannada', tel: 'Telugu', ben: 'Bengali', mar: 'Marathi', guj: 'Gujarati', urd: 'Urdu', spa: 'Spanish', fre: 'French', ger: 'German', ita: 'Italian', jpn: 'Japanese', chi: 'Chinese', por: 'Portuguese', rus: 'Russian', ara: 'Arabic' };
  return names[code] || code.toUpperCase();
}
