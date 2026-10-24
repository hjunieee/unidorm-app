import { useNavigationContainerRef, useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { NavIntent } from "../../push/messaging";
import { resolveGradeShareIntent } from "../../share/gradeShareIntent";
import { openSubPageDepth } from "../../webview/subPageStack";
import type { NativeBridge } from "./types";

type Options = {
  isRoot: boolean;
  bridge: NativeBridge;
  /** Set once the web has acknowledged `bridgeReady`; gates `notificationOpened`. */
  webBridgeReadyRef: RefObject<boolean>;
  navigateSpa: (path: string) => void;
  goHome: (path: string) => void;
};

/**
 * Nav-intent routing: push-notification tap / cold-start, and an incoming OS
 * Share Sheet grade-import. Both resolve to the same `NavIntent` union, so
 * they share one dispatcher (`handleNavIntent`). Intents that arrive before
 * the navigator or the SPA is ready are queued and flushed later — the push
 * queue on the navigator's first state, the SPA queue on `bridgeReady`
 * (`onWebBridgeReady`).
 */
export function useNavIntentRouting({
  isRoot,
  bridge,
  webBridgeReadyRef,
  navigateSpa,
  goHome,
}: Options) {
  const router = useRouter();
  // Read-only access to the live navigation state (push-tap dedupe below).
  // Stable across renders — expo-router hands out the store's single ref.
  const navigationRef = useNavigationContainerRef();

  const pendingNavRef = useRef<string | null>(null);
  const pendingNotificationOpenedRef = useRef<{
    fcmMessageId: number;
    path?: string;
    notificationType?: string;
    campaignId?: string;
    sentAt?: string;
  } | null>(null);
  // 1. push 인텐트를 임시 저장할 Ref 추가
  const pendingPushRef = useRef<NavIntent | null>(null);

  const flushPendingNotificationOpened = useCallback(() => {
    if (!webBridgeReadyRef.current || !pendingNotificationOpenedRef.current)
      return;
    bridge.channel.send(
      "notificationOpened",
      pendingNotificationOpenedRef.current,
    );
    pendingNotificationOpenedRef.current = null;
  }, [bridge, webBridgeReadyRef]);

  const notifyNotificationOpened = useCallback(
    (intent: NavIntent) => {
      if (intent.fcmMessageId === undefined) return;
      pendingNotificationOpenedRef.current = {
        fcmMessageId: intent.fcmMessageId,
        path: intent.kind === "external" ? intent.url : intent.path,
        notificationType: intent.notificationType,
        campaignId: intent.campaignId,
        sentAt: intent.sentAt,
      };
      flushPendingNotificationOpened();
    },
    [flushPendingNotificationOpened],
  );

  const handleNavIntent = useCallback(
    (intent: NavIntent) => {
      notifyNotificationOpened(intent);
      if (intent.kind === "external") {
        WebBrowser.openBrowserAsync(intent.url).catch(() => {});
      } else if (intent.kind === "push") {
        const isReady =
          navigationRef.isReady() && !!navigationRef.getCurrentRoute();
        if (!isReady) {
          pendingPushRef.current = intent; // 네비게이션이 준비될 때까지 대기
          return;
        }
        // Land ON TOP of whatever is open (don't collapse the user's stack) —
        // but never stack a second copy of a page that is already open. Chat
        // notifications for one room arrive as separate notifications with
        // separate ids, so `pendingIntent`'s id dedupe doesn't cover this:
        // without the stack lookup, tapping n of them opened n identical chat
        // screens the user then had to back out of one by one.
        const depth = navigationRef.isReady()
          ? openSubPageDepth(navigationRef.getRootState(), intent.url)
          : null;
        if (depth === null) {
          router.push({
            pathname: "/webview",
            params: { url: intent.url, path: intent.path },
          });
        } else if (depth > 0) {
          // Already open underneath: come back to it instead of duplicating it.
          router.dismiss(depth);
        }
        // depth === 0: it is the top-most screen already — nothing to do.
      } else {
        // spa: a main-tab destination — collapse to root and drive it there.
        // Also queue for the cold-start case where root's SPA hasn't loaded
        // yet; the queued path is flushed on `bridgeReady`.
        goHome(intent.path);
        pendingNavRef.current = intent.path;
      }
    },
    [goHome, navigationRef, notifyNotificationOpened, router],
  );

  // Called from the `bridgeReady` handler, once the web can receive messages.
  const onWebBridgeReady = useCallback(() => {
    flushPendingNotificationOpened();
    // Resolve any queued notification deep-link now the SPA is ready.
    if (isRoot && pendingNavRef.current) {
      navigateSpa(pendingNavRef.current);
      pendingNavRef.current = null;
    }
  }, [flushPendingNotificationOpened, isRoot, navigateSpa]);

  // OS Share Sheet grade-import (Android only for now — app.json's
  // `disableIOS` skips building the iOS share extension, so `hasShareIntent`
  // never turns true there). The hook itself resolves both a cold-start
  // launch (app opened via the share) and a live share while already
  // running, so — unlike push notifications — there's no separate
  // `getInitial…` to poll here.
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();
  useEffect(() => {
    if (!isRoot || !hasShareIntent) return;
    const intent = resolveGradeShareIntent(shareIntent);
    // Consume it either way — a share with nothing usable (e.g. blank text)
    // shouldn't be re-offered on the next render.
    resetShareIntent();
    if (intent) handleNavIntent(intent);
  }, [handleNavIntent, hasShareIntent, isRoot, resetShareIntent, shareIntent]);

  // 3. 네비게이션 준비 상태를 관찰하는 useEffect
  useEffect(() => {
    if (!isRoot) return;

    const checkPendingPush = () => {
      const isReady =
        navigationRef.isReady() && !!navigationRef.getCurrentRoute();
      if (pendingPushRef.current && isReady) {
        const intent = pendingPushRef.current;
        pendingPushRef.current = null;
        handleNavIntent(intent);
      }
    };

    // 마운트 직후 이미 준비 완료된 상태일 수 있으므로 즉시 검사
    checkPendingPush();

    // 네비게이션 상태 변화 감지 리스너 등록
    const unsub = navigationRef.addListener("state", checkPendingPush);
    return unsub;
  }, [isRoot, navigationRef, handleNavIntent]);

  return { handleNavIntent, onWebBridgeReady };
}
