import { useNavigation } from "expo-router";
import { useEffect, type RefObject } from "react";

import type { NativeBridge } from "./types";

/**
 * Fallback for a platform/gesture path that never emits `transitionEnd` for
 * the screen being revealed: `focus` has already fired, so send after roughly
 * one native-stack transition instead of not at all.
 */
const REFOCUS_FALLBACK_MS = 450;

/**
 * Tell the web page it is back on top (`pageFocus`) once the screen that
 * covered it has been popped (or the stack collapsed by `goHome`).
 *
 * Why: every non-main-tab page is its own WebView with its own JS runtime and
 * query cache, and a covered WebView stays mounted without ever seeing a
 * browser `focus`/`visibilitychange`. A notice written or deleted in a pushed
 * page therefore never reached the list underneath. The web refetches the
 * screen's data on this signal.
 *
 * Sent on `transitionEnd` rather than `focus`: `focus` fires as the pop
 * animation *starts*, and a fast response would then visibly reshuffle the
 * list while the covering page is still sliding away. The first appearance is
 * skipped — the page is loading its data then anyway.
 */
export function useScreenRefocus(
  bridge: NativeBridge,
  webBridgeReadyRef: RefObject<boolean>,
) {
  const navigation = useNavigation();

  useEffect(() => {
    let covered = false;
    let fallback: ReturnType<typeof setTimeout> | null = null;

    const send = () => {
      if (fallback) clearTimeout(fallback);
      fallback = null;
      if (!covered) return;
      covered = false;
      if (webBridgeReadyRef.current) bridge.channel.send("pageFocus");
    };

    const offs = [
      navigation.addListener("blur", () => {
        covered = true;
      }),
      navigation.addListener("focus", () => {
        if (!covered) return;
        if (fallback) clearTimeout(fallback);
        fallback = setTimeout(send, REFOCUS_FALLBACK_MS);
      }),
      // `transitionEnd` is a native-stack event, not in the generic event map.
      (navigation.addListener as (
        type: "transitionEnd",
        listener: (e: { data?: { closing?: boolean } }) => void,
      ) => () => void)("transitionEnd", (e) => {
        if (!e.data?.closing && navigation.isFocused()) send();
      }),
    ];

    return () => {
      if (fallback) clearTimeout(fallback);
      for (const off of offs) off();
    };
  }, [bridge, navigation, webBridgeReadyRef]);
}
