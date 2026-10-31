import { describe, expect, it } from 'vitest';
import { getAppStoreLinks } from './storeLinks';

describe('native store links', () => {
  it('allows only the configured official iOS and Android stores', () => {
    expect(getAppStoreLinks({
      VITE_IOS_APP_URL: 'https://apps.apple.com/us/app/mybookshelf/id123',
      VITE_ANDROID_APP_URL: 'https://play.google.com/store/apps/details?id=example.mybookshelf',
    })).toEqual({
      ios: 'https://apps.apple.com/us/app/mybookshelf/id123',
      android: 'https://play.google.com/store/apps/details?id=example.mybookshelf',
    });
  });

  it('shows coming soon when a link is missing or not an official https store URL', () => {
    expect(getAppStoreLinks({ VITE_IOS_APP_URL: 'http://apps.apple.com/app', VITE_ANDROID_APP_URL: 'https://example.com/app' }))
      .toEqual({ ios: null, android: null });
  });
});
