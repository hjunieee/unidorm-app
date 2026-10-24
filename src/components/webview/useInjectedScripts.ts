import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  canMuteWebViewHaptics,
  useSystemGestureBand,
} from "../../../modules/intip-system-gestures";
import { NATIVE_FEATURES, ROOT_URL } from "../../webview/constants";
import {
  buildBridgeShimScript,
  buildEdgeGuardBandScript,
  buildEdgeGuardDiagnosticsScript,
  buildEdgeLongPressGuardScript,
  buildSafeAreaInsetsScript,
  INJECTED_SCRIPT,
} from "../../webview/injectedScript";
import { WEB_CONSOLE_SCRIPT } from "../../webview/webConsole";
import type { WebViewRef } from "./types";

/** Bridge shim is platform-specific (see injectedScript.ts). */
const BRIDGE_SHIM_SCRIPT = buildBridgeShimScript(
  Platform.OS === "ios" ? "ios" : "android",
);

/**
 * `NATIVE_FEATURES` again, but readable before the page's own code runs. The
 * web needs to know whether to hand token refresh to native on its very first
 * request, long before `bridgeCapabilities` could arrive.
 */
const NATIVE_FEATURES_SCRIPT =
  "window.__unidormNativeFeatures=" + JSON.stringify(NATIVE_FEATURES) + ";";

/** Dev builds and dev variant also relay the web's console.* to the Metro log (webConsole.ts). */
export const isDevHost = __DEV__ || ROOT_URL.includes("pages.dev");
const BEFORE_CONTENT_SCRIPT = isDevHost
  ? NATIVE_FEATURES_SCRIPT + BRIDGE_SHIM_SCRIPT + WEB_CONSOLE_SCRIPT
  : NATIVE_FEATURES_SCRIPT + BRIDGE_SHIM_SCRIPT;

/**
 * The WebView's injected scripts (before-content shims + safe-area insets,
 * document-end observers + edge long-press guard), plus the effects that keep
 * an already-loaded page current when the insets or the gesture band change.
 *
 * Returns the system gesture band too, since the native back-gesture guard
 * (`useBackGestureGuard`) must cover the same strips.
 */
export function useInjectedScripts(webViewRef: WebViewRef) {
  // Root reserves no inset natively (the web owns all four via
  // env(safe-area-inset-*) + the injected --native-safe-area-inset-* below).
  // Sub-pages still let native reserve left/right (notch/landscape), but never
  // the top — every pushed page now pads its own header itself, the same way
  // the migrated pages used to (see the insets injection below).
  const insets = useSafeAreaInsets();
  // Combined with the static bridge-shim script so the very first paint
  // already has the native insets available as CSS vars — before content
  // loads, ahead of the page's own layout. Re-injected live below whenever
  // insets change (rotation, foldable), since this only re-runs on a fresh
  // navigation, not a live prop change. `insets` is reference-stable across
  // no-op re-renders (react-native-safe-area-context only swaps the object
  // when a value actually changes), so depending on it directly is safe.
  const beforeContentScript = useMemo(
    () => BEFORE_CONTENT_SCRIPT + buildSafeAreaInsetsScript(insets),
    [insets],
  );

  // 문서 끝 스크립트와 시스템 백 제스처 영역 가드를 구성한다.
  const gestureBand = useSystemGestureBand();

  // 가드는 안드로이드 전용이다. WKWebView는 롱프레스 햅틱 문제가 없고,
  // 가장자리 touchstart를 preventDefault하면 인터랙티브 백 스와이프가 씹힌다.
  const edgeGuardEnabled = Platform.OS === "android";

  // 페이지를 새로 불러올 때마다 다시 실행되므로 현재 폭을 담아야 한다. 이미
  // 떠 있는 페이지에는 아래 effect가 변경된 폭을 주입한다.
  const documentEndScript = useMemo(
    () =>
      INJECTED_SCRIPT +
      (edgeGuardEnabled
        ? buildEdgeLongPressGuardScript(
            gestureBand.left,
            gestureBand.right,
            !canMuteWebViewHaptics,
          ) +
          (__DEV__ ? buildEdgeGuardDiagnosticsScript() : "")
        : ""),
    [edgeGuardEnabled, gestureBand.left, gestureBand.right],
  );

  // Same shape as the insets push below: the guard bakes in the band it was
  // injected with, so a later change (navigation mode, sensitivity slider) has
  // to be pushed. Skipping the first run avoids re-sending what the injected
  // script already carries.
  const skipFirstBandPushRef = useRef(true);
  useEffect(() => {
    if (skipFirstBandPushRef.current) {
      skipFirstBandPushRef.current = false;
      return;
    }
    if (!edgeGuardEnabled) return;
    webViewRef.current?.injectJavaScript(
      buildEdgeGuardBandScript(gestureBand.left, gestureBand.right),
    );
  }, [edgeGuardEnabled, gestureBand.left, gestureBand.right, webViewRef]);

  // Keep the page's safe-area CSS vars current across an insets change after
  // the initial load (rotation, foldable fold/unfold). The initial value is
  // covered by `beforeContentScript` above, so skip the redundant first run.
  const skipFirstInsetsPushRef = useRef(true);
  useEffect(() => {
    if (skipFirstInsetsPushRef.current) {
      skipFirstInsetsPushRef.current = false;
      return;
    }
    webViewRef.current?.injectJavaScript(buildSafeAreaInsetsScript(insets));
  }, [insets, webViewRef]);

  return { beforeContentScript, documentEndScript, gestureBand };
}
