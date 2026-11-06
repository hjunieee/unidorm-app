import { useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

import { nativeAlert } from '../../modules/unidorm-native-dialog';
import SplashArt from '../components/SplashArt';
import WebViewContainer from '../components/WebViewContainer';
import { isConnected } from '../native/network';
import { ROOT_URL, STRINGS } from '../webview/constants';

type GateStatus = 'checking' | 'offline' | 'online';

/**
 * Launch gate: check connectivity before rendering the portal (Swift ref:
 * `ContentView.checkNetwork()`). Once online, the root WebView container mounts
 * and stays mounted for the app's lifetime; sub-pages are pushed on top as
 * native-stack screens (`app/webview.tsx`). Push-notification routing, the
 * launch overlay, and the dev-controller navigator all live in the root
 * container.
 */
export default function Index() {
  const [status, setStatus] = useState<GateStatus>('checking');

  // React Compiler is enabled (app.json), so this stays a plain function — no
  // manual useCallback, which avoids the check/alert circular-memoization warning.
  const check = async () => {
    setStatus('checking');
    let online = await isConnected();
    if (!online) {
      // 앱 최초 기동 시 안드로이드 네트워크 소켓 바인딩 지연 대비 400ms 대기 후 1회 자동 재확인
      await new Promise((resolve) => setTimeout(resolve, 400));
      online = await isConnected();
    }
    if (online) {
      setStatus('online');
      return;
    }
    setStatus('offline');
    nativeAlert(STRINGS.network.title, STRINGS.network.message, [
      { text: STRINGS.network.retry, onPress: () => void check() },
      Platform.OS === 'ios'
        ? { text: STRINGS.network.exit, style: 'destructive' }
        : { text: STRINGS.network.close, style: 'cancel', onPress: () => BackHandler.exitApp() },
    ]);
  };

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'online') {
    return <WebViewContainer mode="root" url={ROOT_URL} />;
  }

  // Checking / offline: keep the splash up. The connectivity check runs before
  // the WebView exists, so anything else here (a themed blank + spinner, as
  // this used to be) shows as a grey flash between the system splash and the
  // container's own splash overlay. The offline case holds it behind the retry
  // dialog for the same reason.
  return <SplashArt />;
}
