import { useCallback, type RefObject } from "react";
import { Linking, Platform } from "react-native";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

import { saveDownload } from "../../native/downloads";
import { PORTAL_HOST } from "../../webview/constants";

/** Extensions we treat as downloads on Android (iOS uses onFileDownload). */
const DOWNLOAD_EXTENSIONS = [
  ".pdf",
  ".hwp",
  ".hwpx",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".csv",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
];

function looksLikeDownload(url: string): boolean {
  const path = url.split("?")[0].toLowerCase();
  return DOWNLOAD_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * External links + Android downloads: the WebView's
 * `onShouldStartLoadWithRequest`. Off-portal and non-http(s) navigations leave
 * the app; download-looking URLs are saved natively on Android.
 */
export function useLoadRequestGuard(devLoadUrlRef: RefObject<string | null>) {
  return useCallback(
    (request: ShouldStartLoadRequest) => {
      const { url: target } = request;
      // Allow sub-frame / resource loads (iOS reports these too).
      if (request.isTopFrame === false) return true;

      // Dev controller "load full URL": let the exact URL a developer asked to
      // load navigate in place, even if off-portal (the guard below would send it
      // to the system browser). One-shot; cleared once consumed.
      if (__DEV__ && devLoadUrlRef.current === target) {
        devLoadUrlRef.current = null;
        return true;
      }

      let host = "";
      try {
        host = new URL(target).host;
      } catch {
        // Non-standard scheme (mailto:, tel:, intent:, market:, blob:) -> hand off.
        if (!/^https?:/i.test(target)) {
          Linking.openURL(target).catch(() => {});
          return false;
        }
      }

      // Android downloads are not surfaced via onFileDownload — catch them here.
      if (Platform.OS === "android" && looksLikeDownload(target)) {
        void saveDownload(target);
        return false;
      }

      // Any off-portal navigation opens in the system browser (spec §6.4).
      if (host && host !== PORTAL_HOST) {
        Linking.openURL(target).catch(() => {});
        return false;
      }
      return true;
    },
    [devLoadUrlRef],
  );
}
