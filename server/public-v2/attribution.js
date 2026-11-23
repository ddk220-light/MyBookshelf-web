export function publicAttribution(value) {
  if (!value || typeof value.label !== 'string' || typeof value.url !== 'string') return undefined;
  const label = value.label.trim();
  if (!label || label.length > 80) return undefined;
  try {
    const url = new URL(value.url);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return { label, url: url.toString() };
  } catch {
    return undefined;
  }
}
