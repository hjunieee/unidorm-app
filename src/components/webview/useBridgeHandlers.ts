import notifee from "@notifee/react-native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, type RefObject } from "react";
import { Linking } from "react-native";
import type { WebViewMessageEvent } from "react-native-webview";

import { nativeAlert } from "../../../modules/intip-native-dialog";
import { PROTOCOL_VERSION } from "../../../packages/intip-bridge/src/messages";
import { handleAgentBridgeMessage } from "../../agent/agentBridgeHandler";
import { refreshWithToken, type RefreshOutcome } from "../../native/authTokens";
import { clearCacheAndReload } from "../../native/cache";
import { clearTokenInfo, saveTokenInfo } from "../../native/secureTokenStore";
import { shareContent } from "../../native/share";
import { NATIVE_FEATURES, STRINGS } from "../../webview/constants";
import {
  isCameraPermissionRequest,
  isGeoPermissionRequest,
} from "../../webview/injectedScript";
import { relayWebConsoleMessage } from "../../webview/webConsole";
import { useWebViewRegistry } from "../../webview/WebViewContext";
import type { NativeBridge, WebViewRef } from "./types";

function toTokenRefreshResult(outcome: RefreshOutcome) {
  if (outcome.status !== "ok") return { status: outcome.status };
  return {
    status: "ok" as const,
    accessToken: outcome.tokenInfo.accessToken,
    refreshToken: outcome.tokenInfo.refreshToken,
    role: outcome.role,
  };
}

type Options = {
  id: string;
  isRoot: boolean;
  url: string;
  bridge: NativeBridge;
  webViewRef: WebViewRef;
  webBridgeReadyRef: RefObject<boolean>;
  setCurrentPath: (path: string) => void;
  dismissOverlay: () => void;
  goHome: (path: string) => void;
  postFcmToken: () => Promise<void>;
  probeWebToken: () => void;
  handleTokenProbeMessage: (raw: string) => boolean;
  onWebBridgeReady: () => void;
  primeLocationPermission: () => void;
  primeCameraPermission: () => void;
};

/**
 * Bridge: Web -> Native. Registers every `channel.on(...)` handler for this
 * container and returns the WebView `onMessage` callback, which peels off the
 * out-of-contract messages (dev console relay, permission pings, token probe,
 * AI agent) before handing the rest to the channel.
 */
export function useBridgeHandlers({
  id,
  isRoot,
  url,
  bridge,
  webViewRef,
  webBridgeReadyRef,
  setCurrentPath,
  dismissOverlay,
  goHome,
  postFcmToken,
  probeWebToken,
  handleTokenProbeMessage,
  onWebBridgeReady,
  primeLocationPermission,
  primeCameraPermission,
}: Options) {
  const router = useRouter();
  const registry = useWebViewRegistry();

  // Dev builds also peel relayed web console messages off before the bridge
  // channel parses the stream (they're not part of the intip-bridge
  // contract); the geo-priming ping is intercepted the same way in every
  // build.
  const onWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const raw = event.nativeEvent.data;
      if (__DEV__) {
        let tag = url;
        try {
          tag = new URL(url).pathname;
        } catch {}
        if (relayWebConsoleMessage(raw, tag)) return;
      }
      if (isGeoPermissionRequest(raw)) {
        primeLocationPermission();
        return;
      }
      if (isCameraPermissionRequest(raw)) {
        primeCameraPermission();
        return;
      }
      if (handleTokenProbeMessage(raw)) return;

      // React Native pools this event object: nativeEvent is nulled out as
      // soon as the handler returns, and agent bridge handlers below are async.
      const relayedEvent = { nativeEvent: { data: raw } } as WebViewMessageEvent;

      // AI Agent: Portal account & Academic info messages
      handleAgentBridgeMessage(raw, (response) => {
        const script = `
          window.dispatchEvent(new CustomEvent('intipAgentResult', {
            detail: ${JSON.stringify(response)}
          }));
          true;
        `;
        webViewRef.current?.injectJavaScript(script);
      }).then((handledAgent) => {
        if (!handledAgent) {
          bridge.onMessage(relayedEvent);
        }
      });
    },
    [
      bridge,
      url,
      primeLocationPermission,
      primeCameraPermission,
      handleTokenProbeMessage,
      webViewRef,
    ],
  );

  useEffect(() => {
    const { channel } = bridge;
    const offs = [
      channel.on("bridgeReady", () => {
        webBridgeReadyRef.current = true;
        // Ask the web for its stored token — see `useTokenSync`. Root only:
        // every WebView shares the same storage, so one probe per launch is
        // enough, and pushed sub-pages would only repeat it.
        if (isRoot) probeWebToken();
        // Flush any queued notification-opened report and SPA deep-link.
        onWebBridgeReady();
        // Advertise what this shell supports. The web can't rely on a
        // request() timeout to detect `share` support (the share sheet can
        // stay open for minutes), so this is sent unprompted right after
        // `bridgeReady` — an old shell that never sends this at all is the
        // signal for "supports none of these".
        channel.send("bridgeCapabilities", {
          protocol: PROTOCOL_VERSION,
          features: [...NATIVE_FEATURES],
        });
      }),
      // Push a new native sub-page screen (spec §3.B/§4). The web only emits
      // this for non-main-tab destinations.
      channel.on("navigateTo", ({ path, url: target }) => {
        router.push({ pathname: "/webview", params: { url: target, path } });
      }),
      // Pop the top-most screen (spec §3.C). No-op on the root.
      channel.on("goBack", () => {
        if (router.canGoBack()) router.back();
      }),
      // Return to a home-tab path — collapse the stack to root and drive root
      // there, regardless of which page (root or a sub) sent it.
      channel.on("goHome", ({ path }) => {
        goHome(path);
      }),
      channel.on("loginSuccess", () => {
        void postFcmToken();
        registry.mergeSession({ loggedIn: true, loginAt: Date.now() });
      }),
      // Mirror the web's JWT into SecureStore so the shell can call
      // authenticated backend endpoints on its own (background FCM token
      // registration) without a live WebView. An empty accessToken is the
      // web's logout signal — clear the native copy too.
      channel.on("syncTokenInfo", (tokenInfo) => {
        void (tokenInfo.accessToken
          ? saveTokenInfo(tokenInfo)
          : clearTokenInfo());
        // 다른 활성 웹뷰(특히 백그라운드에 대기 중인 루트 웹뷰)로 변경된 토큰 정보 실시간 브로드캐스트
        registry.broadcastTokenInfo(tokenInfo, id);
      }),
      // Multi-WebView state sync fallback/second path (see WebViewContext's
      // `relayBroadcastSync` doc comment): relay to every other mounted WebView.
      channel.on("relayBroadcastSync", (message) => {
        registry.relayBroadcastSync(message, id);
      }),
      channel.on("routeChange", (path) => {
        setCurrentPath(path || "/");
        registry.updateWebView(id, { path: path || "/" });
      }),
      channel.on("requestAppUpdate", () => {
        nativeAlert(STRINGS.appUpdate.title, STRINGS.appUpdate.message, [
          { text: STRINGS.appUpdate.cancel, style: "cancel" },
          {
            text: STRINGS.appUpdate.confirm,
            onPress: () => clearCacheAndReload(webViewRef),
          },
        ]);
      }),
      channel.on("openAppSettings", () => {
        Linking.openSettings().catch(() => {});
      }),
      channel.on("requestPermissionSettings", () => {
        Linking.openSettings().catch(() => {});
      }),
      channel.on("logWebDiagnostics", (diag) => {
        console.log("[web-diagnostics]", diag);
      }),
      // Cleanup loop done: reveal the WebView (spec §5.B step 4).
      channel.on("onLaunchWebCleanupFinished", () => {
        dismissOverlay();
      }),
      channel.on("jsAlert", (message) => {
        // Web `alert()` has no title, so this is message-only.
        nativeAlert("", message, [{ text: STRINGS.common.confirm }]);
      }),
      // Web-initiated OS Share Sheet. `shareContent` never rejects, but guard
      // `reply` too (it throws on outgoing schema validation) so a bug here
      // can't escape into the injected-code exception blackhole (see
      // channel.ts's `handleRaw` comment).
      channel.on("share", (value, msg) => {
        void shareContent(value)
          .then((result) => channel.reply(msg, "shareResult", result))
          .catch((error) => console.warn("[bridge] share reply failed", error));
      }),
      // Token refresh on the web's behalf: every WebView funnels through
      // `refreshWithToken`, so two pages booting together cost one server
      // call instead of the second one being refused for a rotated token.
      // The other WebViews hear about the new pair via `tokenInfoUpdated`.
      channel.on("requestTokenRefresh", ({ refreshToken }, msg) => {
        void refreshWithToken(refreshToken)
          .then((outcome) =>
            channel.reply(msg, "tokenRefreshResult", toTokenRefreshResult(outcome)),
          )
          .catch((error) => console.warn("[bridge] token refresh reply failed", error));
      }),
      channel.on("onAppReady", () => {
        webBridgeReadyRef.current = true;
      }),
      channel.on("enterDetailView", (payload) => {
        const targetId = payload?.id;
        const targetPath = payload?.path;
        if (targetId) {
          notifee.cancelNotification(targetId).catch(() => {});
        }
        if (targetPath || targetId) {
          notifee.getDisplayedNotifications().then((notifs) => {
            notifs.forEach((n) => {
              const d = n.notification.data;
              if (
                (targetPath && d?.path === targetPath) ||
                (targetId && (
                  d?.targetId === targetId ||
                  d?.chatRoomId === targetId ||
                  d?.noticeId === targetId ||
                  d?.complaintId === targetId ||
                  d?.roommatePostId === targetId ||
                  d?.id === targetId
                ))
              ) {
                if (n.id) notifee.cancelNotification(n.id).catch(() => {});
              }
            });
          }).catch(() => {});
        }
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [
    bridge,
    dismissOverlay,
    goHome,
    id,
    isRoot,
    onWebBridgeReady,
    postFcmToken,
    probeWebToken,
    registry,
    router,
    setCurrentPath,
    webBridgeReadyRef,
    webViewRef,
  ]);

  return onWebViewMessage;
}
