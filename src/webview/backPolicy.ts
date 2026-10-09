/**
 * Who gets to act on a back request, and what the shell does with the answer.
 *
 * The shell never decides a back press on its own: it delegates to the page
 * (`checkBack`) and resolves the answer here. The page is the only side that
 * knows about its own `pushState`-backed modals (chat image viewer, course
 * filter overlay, search overlay), which the shell used to skip entirely —
 * popping the whole sub-page when the web only wanted its modal closed
 * (issue #15).
 *
 * Kept free of React/react-native so the policy itself is unit-testable.
 */

import { isMainTabPath, normalizePath } from './constants';

/** What the shell should do once the page has (or hasn't) answered. */
export type BackAction =
  /** The page consumed it (closed a modal, walked its own history). */
  | 'none'
  /** Step back inside this WebView's own history (fires `popstate`). */
  | 'webViewGoBack'
  /** Pop this sub-page off the native stack. */
  | 'popScreen'
  /** Navigate back to the home tab before exiting. */
  | 'goToHome'
  /** Root, bottom of the stack: "press again to exit". */
  | 'exitPrompt';

export type BackContext = {
  /**
   * The page's answer to `checkBack`: `true` handled, `false` nothing left to
   * undo, `null` no answer at all (mid-load, blocked JS thread, or a web build
   * that predates `checkBack`).
   */
  handled: boolean | null;
  /** Root portal (main-tab SPA) vs a pushed sub-page. */
  isRoot: boolean;
  /** The WebView's own `canGoBack` from `onNavigationStateChange`. */
  webViewCanGoBack: boolean;
  /** Current pathname of the root or sub-page WebView. */
  currentPath?: string;
};

export function resolveBackAction({
  handled,
  isRoot,
  webViewCanGoBack,
  currentPath = '/',
}: BackContext): BackAction {
  if (handled === true) return 'none';

  if (!isRoot) {
    if (webViewCanGoBack) return 'webViewGoBack';
    return 'popScreen';
  }

  // Root WebView:
  const norm = normalizePath(currentPath);
  const isMainTab = isMainTabPath(norm);
  const isHome = norm === '/' || norm === '/home';

  if (isMainTab) {
    if (isHome) {
      return 'exitPrompt';
    }
    return 'goToHome';
  }

  // If inside root but not a main tab (e.g. sub-path loaded in root)
  if (webViewCanGoBack) return 'webViewGoBack';

  return 'goToHome';
}

