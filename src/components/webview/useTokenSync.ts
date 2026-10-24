import { useCallback } from "react";

import type { TokenInfoPayload } from "../../../packages/intip-bridge/src/messages";
import { clearTokenInfo, readTokenInfo, saveTokenInfo } from "../../native/secureTokenStore";
import { parseTokenProbe, resolveWebToken, TOKEN_PROBE_SCRIPT } from "../../webview/tokenProbe";
import type { WebViewHandle } from "../../webview/WebViewContext";
import type { NativeBridge, WebViewRef } from "./types";

type TokenInfo = Parameters<WebViewHandle["sendTokenInfo"]>[0];

/**
 * 안전망: 웹 측 브릿지 수신 지연이나 구버전 웹에서도 localStorage 및 이벤트가
 * 동기화되도록 직접 주입하는 스크립트.
 */
function buildTokenInfoUpdatedScript(tokenInfo: TokenInfo): string {
  const roleStr = (tokenInfo as any).role || "";
  return `
          (function() {
            try {
              if (window.localStorage) {
                if (${JSON.stringify(tokenInfo.accessToken)}) {
                  localStorage.setItem('accessToken', ${JSON.stringify(tokenInfo.accessToken)});
                  localStorage.setItem('refreshToken', ${JSON.stringify(tokenInfo.refreshToken)});
                  localStorage.setItem('role', ${JSON.stringify(roleStr)});
                } else {
                  localStorage.removeItem('accessToken');
                  localStorage.removeItem('refreshToken');
                  localStorage.removeItem('role');
                }
              }
              window.dispatchEvent(new CustomEvent('tokenInfoUpdated', { detail: ${JSON.stringify(tokenInfo)} }));
            } catch (e) {}
          })();
          true;
        `;
}

/**
 * Keeps the native (SecureStore) auth token and the web's in step: probes the
 * web's stored token and adopts/clears the native copy accordingly, and pushes
 * a native-initiated token change into the page.
 */
export function useTokenSync(bridge: NativeBridge, webViewRef: WebViewRef) {
  // Reconcile the native token with the web's, then refresh the schedule
  // widgets if anything changed — they are the ones that need a session. See
  // `webview/tokenProbe.ts` for why this exists at all (a web session restored
  // from localStorage never sends `syncTokenInfo`) and for the keep/adopt/clear
  // rules.
  const adoptWebToken = useCallback(async (webToken: TokenInfoPayload | null) => {
    const action = resolveWebToken(webToken, await readTokenInfo());
    if (action === "keep") return;
    if (action === "adopt" && webToken) {
      await saveTokenInfo(webToken);
    } else {
      await clearTokenInfo();
    }
  }, []);

  /** Ask the web for its stored token; the reply arrives as a probe message. */
  const probeWebToken = useCallback(() => {
    webViewRef.current?.injectJavaScript(TOKEN_PROBE_SCRIPT);
  }, [webViewRef]);

  /** Consumes a raw WebView message if it is the probe's reply. */
  const handleTokenProbeMessage = useCallback(
    (raw: string): boolean => {
      const probe = parseTokenProbe(raw);
      if (!probe) return false;
      void adoptWebToken(probe.token);
      return true;
    },
    [adoptWebToken],
  );

  const sendTokenInfo = useCallback(
    (tokenInfo: TokenInfo) => {
      bridge.channel.send("tokenInfoUpdated", tokenInfo);
      webViewRef.current?.injectJavaScript(buildTokenInfoUpdatedScript(tokenInfo));
    },
    [bridge, webViewRef],
  );

  return { probeWebToken, handleTokenProbeMessage, sendTokenInfo };
}
