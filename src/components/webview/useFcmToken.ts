import { useCallback } from "react";

import { getFcmTokenWithRetry } from "../../push/messaging";
import { buildReceiveFcmTokenScript } from "../../webview/injectedScript";
import { useWebViewRegistry } from "../../webview/WebViewContext";
import type { NativeBridge, WebViewRef } from "./types";

/** Native -> Web delivery of the device's FCM token. */
export function useFcmToken(bridge: NativeBridge, webViewRef: WebViewRef) {
  const registry = useWebViewRegistry();

  // Hands a known token to the page over both paths and records it in the
  // session snapshot. Also used directly by the root's token-refresh listener.
  const deliverFcmToken = useCallback(
    (token: string) => {
      // 1. 구버전 네이티브(iOS/Android) 호환 웹뷰 스크립트 직접 주입
      const script = buildReceiveFcmTokenScript(token);
      webViewRef.current?.injectJavaScript(script);
      // 2. 신규 브릿지 채널 발송 및 세션 상태 동기화
      bridge.channel.send("receiveFcmToken", token);
      registry.mergeSession({ fcmToken: token });
    },
    [bridge, registry, webViewRef],
  );

  const postFcmToken = useCallback(async () => {
    const token = await getFcmTokenWithRetry();
    if (token) deliverFcmToken(token);
  }, [deliverFcmToken]);

  return { postFcmToken, deliverFcmToken };
}
