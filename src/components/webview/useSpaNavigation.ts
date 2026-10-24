import { useRouter } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import { useCallback } from "react";

import { useWebViewRegistry } from "../../webview/WebViewContext";
import type { NativeBridge, WebViewRef } from "./types";

/**
 * Driving the web SPA from native: an in-place SPA hop on this container
 * (`navigateSpa`), and "go to a main tab" across the whole native stack
 * (`goHome`).
 */
export function useSpaNavigation(bridge: NativeBridge, webViewRef: WebViewRef) {
  const router = useRouter();
  const registry = useWebViewRegistry();

  const navigateSpa = useCallback(
    (path: string) => {
      bridge.channel.send("navigate", path);
      // 브릿지 채널 수신 타이밍 문제나 렌더 지연을 방지하기 위해 웹뷰에 직접 pushState 및 popstate를 함께 발송
      const script = `
        (function() {
          try {
            if (typeof window.navigateToPath === 'function') {
              window.navigateToPath(${JSON.stringify(path)});
            } else if (window.location.pathname !== ${JSON.stringify(path)}) {
              window.history.pushState({}, '', ${JSON.stringify(path)});
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          } catch (e) {}
        })();
        true;
      `;
      webViewRef.current?.injectJavaScript(script);
    },
    [bridge, webViewRef],
  );

  // Collapse the native sub-stack back to root, then drive root's SPA to a
  // main-tab path. Root is always mounted (the index screen), so `driveRoot`
  // works whether or not any sub-pages are currently on top of it.
  const goHome = useCallback(
    (path: string) => {
      void ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      if (router.canGoBack()) {
        try {
          router.dismissAll();
        } catch {
          while (router.canGoBack()) router.back();
        }
      }
      registry.driveRoot(path);
    },
    [registry, router],
  );

  return { navigateSpa, goHome };
}
