/**
 * Network reachability gate.
 * Swift ref: `ContentView.checkNetwork()` (SystemConfiguration reachability).
 */
import NetInfo from '@react-native-community/netinfo';

/** One-shot connectivity check. True when the device is connected & reachable. */
export async function isConnected(): Promise<boolean> {
  const state = await NetInfo.fetch();
  // `isConnected`가 true이면 네트워크 인터페이스(와이파이/셀룰러)가 활성화된 상태입니다.
  // OS 초기 기동 시 100~300ms 동안 `isInternetReachable`이 일시적으로 false일 수 있으므로,
  // `isConnected`가 true이면 연결된 것으로 간주하여 가짜 오프라인 다이얼로그 오탐을 방지합니다.
  if (state.isConnected) return true;
  return Boolean(state.isConnected && state.isInternetReachable !== false);
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function subscribeConnectivity(cb: (connected: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => {
    cb(Boolean(state.isConnected && state.isInternetReachable !== false));
  });
}
