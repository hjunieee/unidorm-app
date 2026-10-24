import { useEffect, type RefObject } from "react";

import { clearCacheAndReload } from "../../native/cache";
import {
  useWebViewRegistry,
  type WebViewHandle,
} from "../../webview/WebViewContext";
import type { NativeBridge, WebViewRef } from "./types";

type Options = {
  id: string;
  mode: "root" | "sub";
  url: string;
  bridge: NativeBridge;
  webViewRef: WebViewRef;
  /** One-shot "let this off-portal URL through" for the dev controller's loadUrl. */
  devLoadUrlRef: RefObject<string | null>;
  navigateSpa: (path: string) => void;
  postFcmToken: () => Promise<void>;
  sendTokenInfo: WebViewHandle["sendTokenInfo"];
};

/**
 * Orchestrator: register this container with the WebView registry and expose
 * its imperative handle (dev controller, cross-WebView token/state sync).
 */
export function useRegistryHandle({
  id,
  mode,
  url,
  bridge,
  webViewRef,
  devLoadUrlRef,
  navigateSpa,
  postFcmToken,
  sendTokenInfo,
}: Options) {
  const registry = useWebViewRegistry();

  useEffect(() => {
    const handle: WebViewHandle = {
      reload: () => webViewRef.current?.reload(),
      reloadClearCache: () => clearCacheAndReload(webViewRef),
      goBackSpa: () => webViewRef.current?.goBack(),
      navigateSpa: (path) => navigateSpa(path),
      // Dev-only: navigate this WebView to a full URL (not an SPA hop). Records
      // the target so the off-portal guard lets it through this once.
      loadUrl: (target) => {
        if (!__DEV__) return;
        devLoadUrlRef.current = target;
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(target)}; true;`,
        );
      },
      refreshFcmToken: () => void postFcmToken(),
      sendTokenInfo,
      sendBroadcastSync: (message) =>
        bridge.channel.send("broadcastSyncMessage", message),
    };
    registry.registerWebView({ id, mode, url, path: "/" }, handle);
    return () => registry.unregisterWebView(id);
  }, [
    id,
    mode,
    url,
    registry,
    navigateSpa,
    postFcmToken,
    sendTokenInfo,
    bridge,
    webViewRef,
    devLoadUrlRef,
  ]);
}
