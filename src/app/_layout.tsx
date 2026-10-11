import { Stack } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import WebViewControllerPanel from "../components/WebViewControllerPanel";
import { AcademicScraperWebView } from "../agent/AcademicScraperWebView";
import { checkForUpdate } from "../native/updateCheck";
import { requestNotificationPermission } from "../push/messaging";
import { backgroundColorFor } from "../theme";
import { WebViewProvider } from "../webview/WebViewContext";

void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 250, fade: true });

export default function RootLayout() {
  const scheme = useColorScheme();
  const contentBackgroundColor = backgroundColorFor(scheme);

  useEffect(() => {
    // 알림 권한 요청 (FCM 채널 생성 및 알림 권한 획득)
    void requestNotificationPermission();
    // OTA 업데이트 체크
    void checkForUpdate();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider
        statusBarTranslucent
        navigationBarTranslucent
        preserveEdgeToEdge
      >
        <ShareIntentProvider>
          <WebViewProvider>
            <StatusBar style="auto" />
            <Stack
              screenOptions={{
                headerShown: false,
                freezeOnBlur: false,
                contentStyle: { backgroundColor: contentBackgroundColor },
              }}
            >
              {/* 루트 웹뷰 화면 */}
              <Stack.Screen name="index" options={{ gestureEnabled: false, freezeOnBlur: false }} />
              {/* 서브페이지 멀티 웹뷰 화면 */}
              <Stack.Screen
                name="webview"
                options={{
                  animation: "ios_from_right",
                  gestureEnabled: true,
                  freezeOnBlur: false,
                }}
              />
            </Stack>
            {/* 디버그용 제어 패널 */}
            <WebViewControllerPanel />
            {/* 숨김 웹뷰: 백그라운드 포털 SSO 및 학적/사생 정보 스크레이퍼 */}
            <AcademicScraperWebView />
          </WebViewProvider>
        </ShareIntentProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
