import { afterEach, describe, expect, it } from 'vitest';
import { analyticsBeforeSend, analyticsEnabled, scrubAnalyticsUrl, startAnalytics } from './analytics';
import { analyticsScriptSource, analyticsSettingOn, siteVerificationToken } from '../../../shared/analytics.mjs';

const O = 'https://mybookshelf.cloud';

describe('analytics URL scrubbing', () => {
  it('drops query strings and fragments everywhere', () => {
    expect(scrubAnalyticsUrl(`${O}/app/shelf?q=wings+of+fire#top`)).toBe(`${O}/app/shelf`);
    expect(scrubAnalyticsUrl(`${O}/?q=anna+library`)).toBe(`${O}/`);
    expect(scrubAnalyticsUrl(`${O}/libraries/anna-centenary-library?ref=x#map`)).toBe(`${O}/libraries/anna-centenary-library`);
  });
  it('collapses book and reading keys, account paths and unknown paths', () => {
    expect(scrubAnalyticsUrl(`${O}/app/books/v1%3Aisbn%3A9780140328721`)).toBe(`${O}/app/books/[book]`);
    expect(scrubAnalyticsUrl(`${O}/app/books/v1:olw:OL45883W/`)).toBe(`${O}/app/books/[book]`);
    expect(scrubAnalyticsUrl(`${O}/app/read/gutenberg:1342`)).toBe(`${O}/app/read/[item]`);
    expect(scrubAnalyticsUrl(`${O}/app/account/reset-password?token=secret`)).toBe(`${O}/app/account`);
    expect(scrubAnalyticsUrl(`${O}/app/account/verify#token=secret`)).toBe(`${O}/app/account`);
    expect(scrubAnalyticsUrl(`${O}/app/9780140328721`)).toBe(`${O}/app/[other]`);
    expect(scrubAnalyticsUrl(`${O}/Someone%20Typed%20This`)).toBe(`${O}/[other]`);
    expect(scrubAnalyticsUrl(`${O}/select/anna-centenary-library?next=/app/shelf`)).toBe(`${O}/select/anna-centenary-library`);
    expect(scrubAnalyticsUrl(`${O}/app/privacy`)).toBe(`${O}/app/privacy`);
  });
  it('reports public pages by name and guides by slug; a typed address on the 404 page is not reported as typed', () => {
    for (const path of ['/', '/libraries', '/about', '/how-it-works', '/open-source', '/privacy', '/support', '/libraries/anna-centenary-library']) {
      expect(scrubAnalyticsUrl(`${O}${path}`)).toBe(`${O}${path}`);
    }
    expect(scrubAnalyticsUrl(`${O}/wings-of-fire`)).toBe(`${O}/[other]`);
    expect(scrubAnalyticsUrl(`${O}/harry-potter/9780439023528`)).toBe(`${O}/[other]`);
    expect(scrubAnalyticsUrl(`${O}/libraries/anna-centenary-library/extra`)).toBe(`${O}/[other]`);
  });
  it('turns on only for exactly "true", as main.tsx checks', () => {
    expect(analyticsSettingOn('true')).toBe(true);
    for (const value of ['TRUE', ' true', 'true ', '1', 'yes', '', undefined, null, true]) expect(analyticsSettingOn(value)).toBe(false);
  });
  it('never reports the admin view or anything that is not a page view', () => {
    expect(scrubAnalyticsUrl(`${O}/app/admin`)).toBeNull();
    expect(scrubAnalyticsUrl(`${O}/app/admin/anything?x=1`)).toBeNull();
    expect(analyticsBeforeSend({ type: 'pageview', url: `${O}/app/admin` })).toBeNull();
    expect(analyticsBeforeSend({ type: 'event', url: `${O}/app/shelf` })).toBeNull();
    expect(analyticsBeforeSend(null)).toBeNull();
    expect(analyticsBeforeSend({ type: 'pageview', url: `${O}/app/books/v1:isbn:9780140328721?q=x` })).toEqual({ type: 'pageview', url: `${O}/app/books/[book]` });
  });
});

describe('analytics loading', () => {
  afterEach(() => { document.head.querySelectorAll('script').forEach(node => node.remove()); delete (window as any).va; delete (window as any).vaq; delete (window as any).__mybookshelfAnalytics; });

  it('is off unless the build turns it on, and never in development', () => {
    expect(analyticsEnabled({})).toBe(false);
    expect(analyticsEnabled({ VITE_ANALYTICS_ENABLED: 'true', PROD: false })).toBe(false);
    expect(analyticsEnabled({ VITE_ANALYTICS_ENABLED: 'false', PROD: true })).toBe(false);
    expect(analyticsEnabled({ VITE_ANALYTICS_ENABLED: 'true', PROD: true })).toBe(true);
    expect(startAnalytics({ PROD: true }, window, document)).toBe(false);
    expect(document.head.querySelector('script')).toBeNull();
  });

  it('queues the scrubber and loads the same-origin script once, without cookies', () => {
    const cookies = document.cookie;
    expect(startAnalytics({ VITE_ANALYTICS_ENABLED: 'true', PROD: true }, window, document)).toBe(true);
    expect(startAnalytics({ VITE_ANALYTICS_ENABLED: 'true', PROD: true }, window, document)).toBe(false);
    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute('src')).toBe('/_vercel/insights/script.js');
    const queue = (window as any).vaq as ArrayLike<unknown>[];
    expect(queue).toHaveLength(1);
    expect(queue[0][0]).toBe('beforeSend');
    expect((queue[0][1] as typeof analyticsBeforeSend)({ type: 'pageview', url: `${O}/app/account/sign-in?returnTo=x` })).toEqual({ type: 'pageview', url: `${O}/app/account` });
    expect(document.cookie).toBe(cookies);
  });

  it('the public pages script runs the same code', () => {
    const win: any = {};
    const appended: any[] = [];
    const doc: any = { createElement: () => ({}), head: { appendChild: (node: unknown) => appended.push(node) } };
    new Function('window', 'document', analyticsScriptSource())(win, doc);
    expect(appended).toEqual([{ src: '/_vercel/insights/script.js', defer: true }]);
    const hook = win.vaq[0][1];
    expect(hook({ type: 'pageview', url: `${O}/app/books/x?y=1` })).toEqual({ type: 'pageview', url: `${O}/app/books/[book]` });
    expect(hook({ type: 'event', url: `${O}/` })).toBeNull();
  });

  it('accepts only a plain Search Console token', () => {
    expect(siteVerificationToken('')).toBeNull();
    expect(siteVerificationToken(undefined)).toBeNull();
    expect(siteVerificationToken('"><script>alert(1)</script>')).toBeNull();
    expect(siteVerificationToken(' abcDEF0123456789_-xyzABC ')).toBe('abcDEF0123456789_-xyzABC');
  });
});
