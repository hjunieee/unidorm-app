import { useMemo } from "react";
import { Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";

import {
  muteWebViewHaptics,
  unmuteWebViewHaptics,
} from "../../../modules/intip-system-gestures";

/**
 * Travel (dp) that commits a touch to being a swipe rather than a tap. Kept
 * well under gesture-handler's default pan slop (10dp) so a *slow* back swipe
 * still hands the touch to the guard early, before the WebView's long-press
 * timer can fire (issue #25).
 */
const EDGE_GUARD_SLOP_DP = 4;

/** 시스템 백 제스처 영역의 터치를 네이티브 제스처로 먼저 처리한다. */
export function useBackGestureGuard(gestureBand: { left: number; right: number }) {
  return useMemo(() => {
    const trace = <T extends { onStart: (cb: () => void) => T }>(
      gesture: T & { runOnJS: (value: boolean) => T },
      label: string,
    ): T =>
      __DEV__
        ? gesture
            .runOnJS(true)
            .onStart(() => console.log(`[edge-diag] native ${label} activated`))
        : gesture;

    const guard = (edge: "left" | "right") => {
      const width = edge === "left" ? gestureBand.left : gestureBand.right;
      return trace(
        Gesture.Pan()
          .hitSlop(
            edge === "left" ? { left: 0, width } : { right: 0, width },
          )
          .activeOffsetX(
            edge === "left" ? EDGE_GUARD_SLOP_DP : -EDGE_GUARD_SLOP_DP,
          )
          .failOffsetY([-EDGE_GUARD_SLOP_DP, EDGE_GUARD_SLOP_DP])
          // 영역에서 시작한 터치 동안 웹뷰 롱프레스 햅틱을 끈다. 시스템이
          // 백 제스처를 가져가면 이 가드는 바로 취소되므로, 되돌리는 시점은
          // unmuteWebViewHaptics가 최소 시간 뒤로 미룬다.
          .runOnJS(true)
          .onBegin(muteWebViewHaptics)
          .onFinalize(unmuteWebViewHaptics)
          // iOS와 버튼 내비게이션에서는 가드를 사용하지 않는다.
          .enabled(Platform.OS === "android" && width > 0),
        `pan/${edge}`,
      );
    };
    return Gesture.Race(guard("left"), guard("right"));
  }, [gestureBand.left, gestureBand.right]);
}
