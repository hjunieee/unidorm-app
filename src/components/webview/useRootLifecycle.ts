import { useRouter } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";

import { clearWebViewCache } from "../../native/cache";
import { onFcmTokenRefresh } from "../../push/fcmTokenSync";
import {
  getInitialNavIntent,
  setupForegroundNotifications,
  subscribeNotificationOpen,
  type NavIntent,
} from "../../push/messaging";
import { useWebViewRegistry } from "../../webview/WebViewContext";
import type { WebViewRef } from "./types";

/** Hard cap on how long the launch overlay waits for the web cleanup signal. */
const CLEANUP_OVERLAY_TIMEOUT_MS = 4000;

type Options = {
  isRoot: boolean;
  webViewRef: WebViewRef;
  handleNavIntent: (intent: NavIntent) => void;
  postFcmToken: () => Promise<void>;
  deliverFcmToken: (token: string) => void;
  dismissOverlay: () => void;
};

/**
 * Everything only the root container owns: the launch cache purge, the
 * push-notification lifecycle, FCM token re-posting, the launch overlay's
 * safety timeout, and the native-stack navigator registration. A no-op for
 * sub-pages.
 */
export function useRootLifecycle({
  isRoot,
  webViewRef,
  handleNavIntent,
  postFcmToken,
  deliverFcmToken,
  dismissOverlay,
}: Options) {
  const router = useRouter();
  const registry = useWebViewRegistry();

  // --- Lifecycle: cache + notifications (root only) --------------------------
  useEffect(() => {
    // Sub-pages share the process-wide WebView cache; only the launch screen
    // clears it (login/cookies preserved) and owns the notification lifecycle.
    if (!isRoot) return;
    clearWebViewCache(webViewRef);

    const unsubForeground = setupForegroundNotifications();
    const unsubOpen = subscribeNotificationOpen(handleNavIntent);
    const unsubTokenRefresh = onFcmTokenRefresh(deliverFcmToken);
    // Cold-start deep link: same branching as a live tap.
    void getInitialNavIntent().then((intent) => {
      if (intent) handleNavIntent(intent);
    });
    // Re-post the FCM token whenever the app returns to the foreground.
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void postFcmToken();
    });
    // Safety net: never leave the overlay stuck if the web never signals back.
    const timeout = setTimeout(dismissOverlay, CLEANUP_OVERLAY_TIMEOUT_MS);
    return () => {
      unsubForeground();
      unsubOpen();
      unsubTokenRefresh();
      appStateSub.remove();
      clearTimeout(timeout);
    };
  }, [deliverFcmToken, dismissOverlay, handleNavIntent, isRoot, postFcmToken, webViewRef]);

  // The root owns the expo-router stack, so it registers native-stack navigation
  // (push/pop/popToRoot) the controller uses to restore a saved session.
  useEffect(() => {
    if (!isRoot) return;
    registry.registerNavigator({
      push: (target, path) =>
        router.push({ pathname: "/webview", params: { url: target, path } }),
      pop: () => {
        if (router.canGoBack()) router.back();
      },
      popToRoot: () => {
        try {
          if (router.canGoBack()) router.dismissAll();
        } catch {
          while (router.canGoBack()) router.back();
        }
      },
    });
    return () => registry.registerNavigator(null);
  }, [isRoot, registry, router]);
}
