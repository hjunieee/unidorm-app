/**
 * A single UNIDorm WebView container — the unit of the native multi-WebView stack.

 * The root portal (`mode="root"`) hosts the main-tab SPA and is the
 * always-mounted launch screen; every sub-page is a pushed instance
 * (`mode="sub"`) on its own expo-router native-stack screen, so it gets the
 * slide-in animation and swipe-back **natively** from react-native-screens.
 *
 * This replaces the Tier 3 custom `WebViewHost` (persistent layer + Reanimated
 * slide + warm pool). That design existed to reuse warmed WebView instances,
 * but its real-world hit rate was near-zero and driving a live Android WebView
 * with a JS transform flickered (half-white flash on push/pop). Native-stack
 * transitions are OS-composited, so that flicker is gone; the trade-off is no
 * warm reuse (every sub-page cold-loads), which the measurements showed costs
 * little.
 *
 * Both modes share the full JS <-> Native bridge. The root additionally owns the
 * push-notification lifecycle, the native-stack navigator registration (for the
 * dev controller / `restoreSession`), and the launch cache-purge overlay.
 *
 * This component is the composition root: each concern lives in its own hook
 * under `./webview/` and is wired together here.
 */
import { useFocusEffect } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useKeyboardState } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView, { type WebViewNavigation } from "react-native-webview";

// Shared bridge is vendored as a git submodule under packages/unidorm-bridge and
// compiled from source (no npm package / registry). See AGENTS.md.
import { createNativeChannel } from "../../packages/unidorm-bridge/src/adapters/native";
import { saveDownload } from "../native/downloads";
import { backgroundColorFor, INDICATOR_COLOR } from "../theme";
import { APP_UA_SUFFIX, isMainTabPath } from "../webview/constants";
import { LAUNCH_CLEANUP_SCRIPT } from "../webview/injectedScript";
import { nextWebViewSeq, useWebViewRegistry } from "../webview/WebViewContext";
import SplashArt from "./SplashArt";
import { useBackGestureGuard } from "./webview/useBackGestureGuard";
import { useBridgeHandlers } from "./webview/useBridgeHandlers";
import { useFcmToken } from "./webview/useFcmToken";
import { isDevHost, useInjectedScripts } from "./webview/useInjectedScripts";
import { useLoadRequestGuard } from "./webview/useLoadRequestGuard";
import { useNavIntentRouting } from "./webview/useNavIntentRouting";
import { usePermissionPriming } from "./webview/usePermissionPriming";
import { useRegistryHandle } from "./webview/useRegistryHandle";
import { useRevealOverlay } from "./webview/useRevealOverlay";
import { useRootLifecycle } from "./webview/useRootLifecycle";
import { useSpaNavigation } from "./webview/useSpaNavigation";
import { useSystemBack } from "./webview/useSystemBack";
import { useTokenSync } from "./webview/useTokenSync";

type Props = {
  /** Absolute URL this container loads. */
  url: string;
  /** Root portal hosts the main tabs; sub-pages are pushed on top. */
  mode: "root" | "sub";
};

export default function WebViewContainer({ url, mode }: Props) {
  const webViewRef = useRef<WebView>(null);
  // PlatformChannel over the single react-native-webview channel. `onMessage`
  // is wired to the WebView prop; Web->Native handlers are registered in
  // `useBridgeHandlers`.
  //
  // The cast below papers over a duplicate-install quirk, not a real type
  // mismatch: the bridge submodule (packages/unidorm-bridge) has its own
  // node_modules/react-native-webview (13.17.0) separate from the app's root
  // one (13.16.1), so TS resolves two structurally-different `WebView`
  // classes (their default generic differs: `{}` vs `undefined`) for what is
  // the exact same runtime ref at build/run time.
  const nativeChannelRef = webViewRef as unknown as Parameters<
    typeof createNativeChannel
  >[0];
  const bridge = useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => createNativeChannel(nativeChannelRef),
    [nativeChannelRef],
  );

  const scheme = useColorScheme();
  const backgroundColor = backgroundColorFor(scheme);
  const isRoot = mode === "root";

  // Connect this container to the WebView orchestrator (shared dev controller).
  const registry = useWebViewRegistry();
  const [id] = useState(() => `${mode}-${nextWebViewSeq()}`);

  const [currentPath, setCurrentPath] = useState<string>("/");
  const [canGoBack, setCanGoBack] = useState(false);
  const canGoBackRef = useRef(false);
  // `onLoadEnd` does not guarantee the web app has registered its NativeToWeb
  // handlers. Wait for its explicit `bridgeReady` acknowledgement instead.
  const webBridgeReadyRef = useRef(false);
  const cleanupStartedRef = useRef(false);
  // Dev controller "load full URL": the URL a developer asked to load in place.
  // Lets `onShouldStartLoadWithRequest` allow that one navigation even off-portal
  // (which the security guard would otherwise divert to the system browser).
  const devLoadUrlRef = useRef<string | null>(null);

  const { primeLocationPermission, primeCameraPermission } =
    usePermissionPriming(url);
  const { beforeContentScript, documentEndScript, gestureBand } =
    useInjectedScripts(webViewRef);
  const { overlayVisible, overlayOpacity, dismissOverlay } =
    useRevealOverlay(isRoot);

  // --- Native -> Web helpers -------------------------------------------------
  const { navigateSpa, goHome } = useSpaNavigation(bridge, webViewRef);
  const { postFcmToken, deliverFcmToken } = useFcmToken(bridge, webViewRef);
  const { probeWebToken, handleTokenProbeMessage, sendTokenInfo } =
    useTokenSync(bridge, webViewRef);

  const { handleNavIntent, onWebBridgeReady } = useNavIntentRouting({
    isRoot,
    bridge,
    webBridgeReadyRef,
    navigateSpa,
    goHome,
  });
  useRootLifecycle({
    isRoot,
    webViewRef,
    handleNavIntent,
    postFcmToken,
    deliverFcmToken,
    dismissOverlay,
  });
  useRegistryHandle({
    id,
    mode,
    url,
    bridge,
    webViewRef,
    devLoadUrlRef,
    navigateSpa,
    postFcmToken,
    sendTokenInfo,
  });
  useSystemBack({
    isRoot,
    bridge,
    webViewRef,
    canGoBack,
    canGoBackRef,
    currentPath,
    setCurrentPath,
    navigateSpa,
  });
  const onWebViewMessage = useBridgeHandlers({
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
  });
  const onShouldStartLoadWithRequest = useLoadRequestGuard(devLoadUrlRef);
  const backGestureGuard = useBackGestureGuard(gestureBand);

  // 컨테이너 언마운트 시 잔류할 수 있는 화면 캡처 방지 플래그(FLAG_SECURE) 안전 해제
  useEffect(() => {
    return () => {
      void ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, []);

  // 서브 스택에서 pop되어 루트 컨테이너로 포커스가 복귀할 때 캡처 방지 해제 보장
  useFocusEffect(
    useCallback(() => {
      if (isRoot) {
        void ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      }
    }, [isRoot])
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      canGoBackRef.current = nav.canGoBack;
      setCanGoBack(nav.canGoBack);
      if (nav.url) {
        try {
          const u = new URL(nav.url);
          setCurrentPath(u.pathname);
        } catch {}
      }
      registry.updateWebView(id, { canGoBack: nav.canGoBack, url: nav.url });
    },
    [id, registry],
  );

  const onLoadEnd = useCallback(() => {
    // Push the FCM token into the web context after every page load (spec §5.A).
    void postFcmToken();

    if (isRoot) {
      // Kick off the one-time service-worker/cache cleanup loop (spec §5.B).
      if (!cleanupStartedRef.current) {
        cleanupStartedRef.current = true;
        webViewRef.current?.injectJavaScript(LAUNCH_CLEANUP_SCRIPT);
      }
    } else {
      // Sub-page: the document is loaded, so the page has (or is one frame from)
      // its first paint — cross-fade the reveal overlay away instead of letting
      // the content pop in on top of the slide-in transition.
      dismissOverlay();
    }
  }, [dismissOverlay, isRoot, postFcmToken]);

  const onLoadStart = useCallback(() => {
    if (isRoot) webBridgeReadyRef.current = false;
  }, [isRoot]);

  // Jetsam recovery (iOS content-process termination / Android render-process
  // gone): a visible container just reloads itself in place.
  const onContentProcessDied = useCallback(() => {
    webViewRef.current?.reload();
  }, []);

  // Soft-keyboard avoidance (Android). The app runs edge-to-edge, and under
  // edge-to-edge Android stops honouring `adjustResize`: the window keeps its
  // full height when the IME opens, so the WebView viewport never shrinks and
  // the keyboard simply covers whatever input sits at the bottom of the page.
  //
  // `KeyboardProvider` (see `app/_layout.tsx`) reports the real IME inset, and
  // padding the container by it reproduces what `adjustResize` used to do:
  // the WebView gets shorter, so the engine scrolls the focused input into the
  // remaining viewport by itself.
  //
  // iOS is deliberately left at 0 — WKWebView already insets its own scroll
  // view for the keyboard, so shrinking the host view too would double-count
  // and push the focused input a keyboard's height too far up.
  const keyboardHeight = useKeyboardState((state) => state.height);
  const keyboardInset = Platform.OS === "android" ? keyboardHeight : 0;

  // Root sits on the main tabs -> no WebView-level swipe-back; sub-pages let the
  // native stack own the swipe so it pops the screen (spec §3.C.2 / §6.5).
  const webViewSwipeBack = isRoot && !isMainTabPath(currentPath);

  const webView = (
    <WebView
      hideKeyboardAccessoryView
      ref={webViewRef}
      source={{ uri: url }}
      style={[styles.fill, { backgroundColor }]}
      // Identify as the official app so the web enables multi-WebView routing.
      applicationNameForUserAgent={APP_UA_SUFFIX}
      // Cache: ON. Freshness is enforced *once per launch* — the root clears the
      // HTTP cache on mount and the cleanup script purges service workers +
      // CacheStorage — so nothing stale survives a launch. Keeping the HTTP
      // cache disabled for the whole session instead made every pushed sub-page
      // re-download the entire SPA bundle over the network, which is what
      // stretched the blank reveal gap on push (spec §5.B still holds).
      cacheEnabled
      // Dev builds only: chrome://inspect (Android) / Safari Web Inspector (iOS).
      webviewDebuggingEnabled={isDevHost}
      // Bridge wiring: shims + alert override before content, observers after.
      onMessage={onWebViewMessage}
      injectedJavaScriptBeforeContentLoaded={beforeContentScript}
      injectedJavaScript={documentEndScript}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      onNavigationStateChange={onNavigationStateChange}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
      onContentProcessDidTerminate={onContentProcessDied}
      onRenderProcessGone={onContentProcessDied}
      decelerationRate={1.2}
      onFileDownload={({ nativeEvent }) =>
        saveDownload(nativeEvent.downloadUrl)
      }
      // Inline media — videos must not auto-fullscreen (spec §6.3).
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction
      mediaCapturePermissionGrantType="grantIfSameHostElseDeny"
      allowsBackForwardNavigationGestures={webViewSwipeBack}
      contentInsetAdjustmentBehavior="never"
      geolocationEnabled
      allowsFullscreenVideo={false}
      originWhitelist={["https://*", "http://*", "about:*"]}
      pullToRefreshEnabled={false}
    />
  );

  // The guard wraps the WebView in its own host view rather than attaching to
  // the WebView directly, so gesture-handler's ref does not fight `webViewRef`.
  const guardedWebView = (
    <GestureDetector gesture={backGestureGuard}>
      <View style={styles.fill} collapsable={false}>
        {webView}
      </View>
    </GestureDetector>
  );

  return (
    // Fill the screen; ignore the bottom inset so content reaches the edge —
    // except for the soft keyboard, which the container gives up room to.
    <View
      style={[styles.fill, { backgroundColor, paddingBottom: keyboardInset }]}
    >
      {isRoot ? (
        // Root goes fully edge-to-edge on every side; the web owns all four
        // insets via env(safe-area-inset-*) / the injected CSS vars above.
        guardedWebView
      ) : (
        // Sub-pages keep native left/right (notch/landscape) reservation, but
        // no longer reserve the top inset — every pushed page pads its own
        // header itself using the safe-area values injected above.
        <SafeAreaView style={[styles.subScreen, { backgroundColor }]} edges={["left", "right"]}>
          {guardedWebView}
        </SafeAreaView>
      )}

      {overlayVisible && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.overlay,
            { opacity: overlayOpacity },
            // Root paints its own background inside SplashArt.
            isRoot ? null : { backgroundColor },
          ]}
        >
          {isRoot ? (
            // Root's overlay *is* the launch screen: it continues the system
            // splash (same background, same logo at the same fixed dp) and adds
            // the artwork the system splash cannot draw, then cross-fades away
            // once the web signals the launch cleanup is done. A spinner here
            // would read as a second, unbranded loading screen.
            <SplashArt />
          ) : (
            <ActivityIndicator size="large" color={INDICATOR_COLOR} />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  subScreen: {
    flex: 1,
    elevation: 28,
    shadowColor: "#000",
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
