/**
 * A pushed sub-page in the native multi-WebView stack (spec §3). Reached when
 * the web calls `navigateTo(path, url)` from a non-main-tab destination; the
 * native stack (react-native-screens) gives it the slide-in animation and
 * swipe-back gesture for free — no custom transform, so no Android flicker.
 */
import { useEffect, useCallback } from 'react';
import { Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';

import WebViewContainer from '../components/WebViewContainer';
import { PORTAL_HOST } from '../webview/constants';

/** True when `url` points at the portal host and is therefore safe to host. */
function isPortalUrl(url: string): boolean {
  try {
    return new URL(url).host === PORTAL_HOST;
  } catch {
    return false;
  }
}

export default function WebViewScreen() {
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url?: string; path?: string }>();
  const target = typeof url === 'string' ? url : '';
  const valid = isPortalUrl(target);

  // 서브페이지가 닫히거나 언마운트될 때 화면 캡처 방지(FLAG_SECURE)를 안전하게 해제
  useEffect(() => {
    return () => {
      void ScreenCapture.allowScreenCaptureAsync().catch((err) => {
        console.warn('[WebViewScreen] Failed to allow screen capture on unmount:', err);
      });
    };
  }, []);

  // 서브 스택에서 포커스를 잃고 이전 화면으로 복귀할 때도 캡처 방지 해제 보장
  useFocusEffect(
    useCallback(() => {
      return () => {
        void ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      };
    }, [])
  );

  // Defence in depth: navigateTo should only ever pass portal URLs, but if an
  // off-portal URL slips through, hand it to the system browser and pop back.
  useEffect(() => {
    if (!valid) {
      if (target) Linking.openURL(target).catch(() => {});
      if (router.canGoBack()) router.back();
    }
  }, [router, target, valid]);

  if (!valid) return null;
  return <WebViewContainer mode="sub" url={target} />;
}

