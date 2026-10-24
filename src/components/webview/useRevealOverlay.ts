import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

/** Hard cap on how long a sub-page holds its reveal overlay waiting for load. */
const REVEAL_OVERLAY_TIMEOUT_MS = 4000;

/** Cross-fade used to reveal the WebView once its content is ready. */
const OVERLAY_FADE_MS = 250;

/**
 * Reveal overlay: a flat themed screen held over the WebView until its
 * content is ready, then cross-faded out. Without it a pushed sub-page slides
 * in as a bare background-coloured card and the page *pops* in whenever the
 * cold load happens to finish — the visible "black (dark) / white (light)
 * flash" during the native-stack transition. Root reuses the same overlay to
 * additionally mask the launch service-worker/cache purge.
 *  - root: lifted by `onLaunchWebCleanupFinished` (or the root lifecycle's
 *    CLEANUP_OVERLAY_TIMEOUT_MS, see `useRootLifecycle`)
 *  - sub:  lifted by `onLoadEnd` (or REVEAL_OVERLAY_TIMEOUT_MS)
 */
export function useRevealOverlay(isRoot: boolean) {
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const overlayDismissedRef = useRef(false);

  // Idempotent: the load signal and the safety timeout race, and whichever
  // lands first owns the fade.
  const dismissOverlay = useCallback(() => {
    if (overlayDismissedRef.current) return;
    overlayDismissedRef.current = true;
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: OVERLAY_FADE_MS,
      useNativeDriver: true,
    }).start(() => setOverlayVisible(false));
  }, [overlayOpacity]);

  // Sub-pages lift the reveal overlay from `onLoadEnd`; this is the safety net
  // for a load that errors out or never ends (root has its own in
  // `useRootLifecycle`).
  useEffect(() => {
    if (isRoot) return;
    const timeout = setTimeout(dismissOverlay, REVEAL_OVERLAY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [dismissOverlay, isRoot]);

  return { overlayVisible, overlayOpacity, dismissOverlay };
}
