import { useCallback, useEffect } from "react";
import { Platform } from "react-native";

import { ensureCameraPermission, ensureLocationPermission } from "../../native/permissions";

/**
 * Camera/location permission priming happens at most once per app session —
 * module-scoped, not per `WebViewContainer` instance. `INJECTED_SCRIPT` posts
 * `loginSuccess` unconditionally on every page load whenever a token is
 * already in localStorage (not just on a fresh login), so every freshly
 * pushed sub-page's own `loginSuccess` handler would otherwise re-prime on
 * its first load — surfacing as a permission dialog popping up out of
 * nowhere when entering e.g. the timetable edit page.
 * Location permission priming happens at most once per app session —
 * module-scoped, not per `WebViewContainer` instance — and is triggered
 * lazily by `GEO_REQUEST_MARKER` (the first time *any* mounted page actually
 * calls `navigator.geolocation`), not by `loginSuccess`. `INJECTED_SCRIPT`
 * posts `loginSuccess` unconditionally on every page load whenever a token is
 * already in localStorage (not just on a fresh login), so tying priming to it
 * used to re-prime on every freshly pushed sub-page's first load — surfacing
 * as a permission dialog popping up out of nowhere on pages that never touch
 * location (e.g. the timetable edit page).
 *
 * Camera: Android's react-native-webview drops the camera intent if CAMERA
 * permission is not yet granted at runtime. Lazily primed via
 * `CAMERA_REQUEST_MARKER` or on entering media-upload pages (/chat, /complain).
 */
let locationPermissionPrimed = false;
let cameraPermissionPrimed = false;

/**
 * Lazy camera/location permission priming for one container. The returned
 * callbacks are invoked from the WebView message stream when the page pings
 * `GEO_REQUEST_MARKER` / `CAMERA_REQUEST_MARKER`.
 */
export function usePermissionPriming(url: string) {
  // Prime location (campus map) permission lazily — the first time any
  // mounted page actually calls `navigator.geolocation` (see
  // `GEO_REQUEST_MARKER`), not eagerly on login. At most once per app
  // session (see `locationPermissionPrimed` above).
  const primeLocationPermission = useCallback(() => {
    if (locationPermissionPrimed) return;
    locationPermissionPrimed = true;
    void ensureLocationPermission();
  }, []);

  const primeCameraPermission = useCallback(() => {
    if (cameraPermissionPrimed || Platform.OS !== "android") return;
    cameraPermissionPrimed = true;
    void ensureCameraPermission();
  }, []);

  // Media-upload route priming: on Android, entering chat or complain pages
  // primes camera permission lazily so file chooser intents never drop.
  useEffect(() => {
    if (Platform.OS === "android") {
      const lower = url.toLowerCase();
      if (lower.includes("/chat") || lower.includes("/complain")) {
        primeCameraPermission();
      }
    }
  }, [url, primeCameraPermission]);

  return { primeLocationPermission, primeCameraPermission };
}
