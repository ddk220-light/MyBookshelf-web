export type AppStoreLinks = { ios: string | null; android: string | null };

function safeStoreUrl(value: unknown, allowedHosts: string[]): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getAppStoreLinks(environment: Record<string, unknown> = import.meta.env): AppStoreLinks {
  return {
    ios: safeStoreUrl(environment.VITE_IOS_APP_URL, ['apps.apple.com', 'itunes.apple.com']),
    android: safeStoreUrl(environment.VITE_ANDROID_APP_URL, ['play.google.com']),
  };
}
