import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, type RefObject } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";

import { resolveBackAction } from "../../webview/backPolicy";
import type { NativeBridge, WebViewRef } from "./types";

/**
 * How long a back press waits for the page's `backResult` before the shell
 * decides on its own. The web answers from a message handler, so a healthy
 * page replies in tens of milliseconds; this budget only covers a page that is
 * mid-load or whose JS thread is blocked. Long enough not to pre-empt a busy
 * page, short enough that a dead one still feels like a button press.
 */
const BACK_DELEGATION_TIMEOUT_MS = 350;

type Options = {
  isRoot: boolean;
  bridge: NativeBridge;
  webViewRef: WebViewRef;
  canGoBack: boolean;
  canGoBackRef: RefObject<boolean>;
  currentPath: string;
  setCurrentPath: (path: string) => void;
  navigateSpa: (path: string) => void;
};

/**
 * --- Android system back (only while this screen is focused) ---------------
 *
 * The shell never decides a back press on its own. Android's system back is
 * "the app's back", so it asks the page first (`checkBack`) and acts only on
 * the answer — the page is the only side that knows about its own
 * `pushState`-backed modals (image viewer, filter overlay, search overlay),
 * which is exactly what used to get skipped: a sub-page popped the whole
 * native screen while the web only wanted its modal closed (issue #15).
 */
export function useSystemBack({
  isRoot,
  bridge,
  webViewRef,
  canGoBack,
  canGoBackRef,
  currentPath,
  setCurrentPath,
  navigateSpa,
}: Options) {
  const router = useRouter();
  const lastBackPressRef = useRef(0);

  // Returns `true` (handled) / `false` (nothing left to undo) / `null` when the
  // page never answered — mid-load or a blocked JS thread.
  const askWebToHandleBack = useCallback(async (): Promise<boolean | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reply = await Promise.race([
        // A late rejection (the channel's own 10s request timeout) is absorbed
        // by the already-settled race — no unhandled rejection.
        bridge.channel.request("checkBack"),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), BACK_DELEGATION_TIMEOUT_MS);
        }),
      ]);
      if (!reply) return null;
      // An old web build without the `checkBack` handler can't reply at all, so
      // anything other than `backResult` is treated as "no answer".
      return reply.event === "backResult" ? reply.value.handled : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }, [bridge]);

  // Guards the async gap: hammering the back button must not queue up one
  // screen pop per press.
  const backInFlightRef = useRef(false);

  const handleSystemBack = useCallback(async () => {
    if (backInFlightRef.current) return;
    backInFlightRef.current = true;
    try {
      const action = resolveBackAction({
        handled: await askWebToHandleBack(),
        isRoot,
        webViewCanGoBack: canGoBackRef.current,
        currentPath,
      });
      switch (action) {
        case "none":
          return;
        case "webViewGoBack":
          webViewRef.current?.goBack();
          return;
        case "popScreen":
          if (router.canGoBack()) router.back();
          return;
        case "goToHome": {
          setCurrentPath("/home");
          navigateSpa("/home");
          return;
        }
        case "exitPrompt": {
          const now = Date.now();
          if (now - lastBackPressRef.current < 2000) {
            BackHandler.exitApp();
            return;
          }
          lastBackPressRef.current = now;
          ToastAndroid.show(
            "뒤로 가기를 한 번 더 누르면 종료됩니다.",
            ToastAndroid.SHORT,
          );
        }
      }
    } finally {
      backInFlightRef.current = false;
    }
  }, [
    askWebToHandleBack,
    canGoBackRef,
    currentPath,
    isRoot,
    navigateSpa,
    router,
    setCurrentPath,
    webViewRef,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;

      // 루트 웹뷰: 메인 탭 이동 및 /home 2초 내 재입력 종료 토스트 처리를 위해 항상 BackHandler 등록
      if (isRoot) {
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
          void handleSystemBack();
          return true;
        });
        return () => sub.remove();
      }

      // 서브 웹뷰:
      // 웹뷰 내부에 back stack이 남아있는 경우(canGoBack === true):
      // 시스템 예측 뒤로가기를 가로채(비활성화) 웹뷰 내부 back stack을 우선 소모
      if (canGoBack) {
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
          void handleSystemBack();
          return true;
        });
        return () => sub.remove();
      }

      // 웹뷰 내부 back stack이 다 소모된 경우(canGoBack === false):
      // BackHandler를 등록하지 않음 -> Android OS(One UI 8)의 시스템 예측 뒤로가기(Predictive Back)로 화면 pop 위임
      return undefined;
    }, [canGoBack, handleSystemBack, isRoot]),
  );
}
