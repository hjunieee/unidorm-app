import { describe, it, expect } from '@jest/globals';
import { resolveDeepLink } from '../deepLink';
import { ROOT_URL } from '../../webview/constants';

describe('resolveDeepLink', () => {
  it('routes a main-tab path through the root WebView (spa)', () => {
    expect(resolveDeepLink('https://unidorm.inuappcenter.kr/home')).toEqual({
      kind: 'spa',
      path: '/home',
    });
  });

  it('treats the /m mobile prefix as the same main tab', () => {
    expect(resolveDeepLink('https://unidorm.inuappcenter.kr/m/home')).toEqual({
      kind: 'spa',
      path: '/m/home',
    });
  });

  it('pushes a native sub-page for everything else, query string intact', () => {
    expect(
      resolveDeepLink('https://unidorm.inuappcenter.kr/roommate/detail/456?from=push'),
    ).toEqual({
      kind: 'push',
      path: '/roommate/detail/456?from=push',
      url: `${ROOT_URL}/roommate/detail/456?from=push`,
    });
  });

  it('normalizes the origin: a link on the dev portal host still opens on ROOT_URL', () => {
    // Both hosts are claimed, but the two WebViews share the login token
    // through one origin's localStorage — a sub-page on the other host would
    // come up logged out.
    const intent = resolveDeepLink('https://unidorm-test.pages.dev/chat/open/123');
    expect(intent).toEqual({
      kind: 'push',
      path: '/chat/open/123',
      url: `${ROOT_URL}/chat/open/123`,
    });
  });

  it('keeps the fragment on the pushed URL', () => {
    expect(resolveDeepLink('https://unidorm.inuappcenter.kr/rules#top')).toEqual({
      kind: 'push',
      path: '/rules#top',
      url: `${ROOT_URL}/rules#top`,
    });
  });

  it('hands the static legal pages back to a browser', () => {
    const url = 'https://unidorm.inuappcenter.kr/privacy-policy.html';
    expect(resolveDeepLink(url)).toEqual({ kind: 'external', url });
    const terms = 'https://unidorm.inuappcenter.kr/terms-of-use.html';
    expect(resolveDeepLink(terms)).toEqual({ kind: 'external', url: terms });
  });

  it('hands the domain-association files back to a browser', () => {
    const url = 'https://unidorm.inuappcenter.kr/.well-known/assetlinks.json';
    expect(resolveDeepLink(url)).toEqual({ kind: 'external', url });
  });

  it('opens a widget/shortcut link on its portal path, main tab or sub-page', () => {
    expect(resolveDeepLink('unidormapp://widget/roommate')).toEqual({ kind: 'spa', path: '/roommate' });
    expect(resolveDeepLink('unidormapp://widget/chat')).toEqual({ kind: 'spa', path: '/chat' });

    expect(resolveDeepLink('unidormapp://widget/roommate/detail/123')).toEqual({
      kind: 'push',
      path: '/roommate/detail/123',
      url: `${ROOT_URL}/roommate/detail/123`,
    });
  });

  it('accepts a widget link handed over as a bare path', () => {
    // The router may pass the hook just the path of a custom-scheme URL.
    expect(resolveDeepLink('/widget/chat')).toEqual({ kind: 'spa', path: '/chat' });
    expect(resolveDeepLink('unidormapp://widget')).toEqual({ kind: 'spa', path: '/' });
  });

  it('routes relative paths and custom scheme paths as portal paths', () => {
    expect(resolveDeepLink('/home')).toEqual({
      kind: 'spa',
      path: '/home',
    });
    expect(resolveDeepLink('/roommate/detail/123')).toEqual({
      kind: 'push',
      path: '/roommate/detail/123',
      url: `${ROOT_URL}/roommate/detail/123`,
    });
    expect(resolveDeepLink('unidormapp://roommate/detail/123')).toEqual({
      kind: 'push',
      path: '/roommate/detail/123',
      url: `${ROOT_URL}/roommate/detail/123`,
    });
  });

  it('does not strip the prefix off a widget look-alike', () => {
    // `widget` only counts as the widget prefix on a path boundary; anything
    // else is just another portal path, not a widget link.
    expect(resolveDeepLink('unidormapp://widgets/test')).toEqual({
      kind: 'push',
      path: '/widgets/test',
      url: `${ROOT_URL}/widgets/test`,
    });
    expect(resolveDeepLink('/widgetfoo')).toEqual({
      kind: 'push',
      path: '/widgetfoo',
      url: `${ROOT_URL}/widgetfoo`,
    });
  });

  it('ignores other hosts, unrecognised schemes and invalid URLs', () => {
    expect(resolveDeepLink('https://inu.ac.kr/notice/1')).toBeNull();
    expect(resolveDeepLink('https://evil.example.com/home')).toBeNull();
    // A look-alike subdomain must not match either — the host list is exact.
    expect(resolveDeepLink('https://unidorm.inuappcenter.kr.evil.com/home')).toBeNull();
    expect(resolveDeepLink('')).toBeNull();
  });
});
