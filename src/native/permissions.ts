/**
 * Runtime permission helpers (react-native-permissions).
 *
 * The portal's WebView uses the camera (photo upload) and location (campus map).
 *
 * Location: iOS WKWebView's geolocation relies on the app's Core Location
 * authorization and will NOT prompt on its own, so the app must request it.
 * `WebViewContainer` calls `ensureLocationPermission` lazily — the first time
 * a page actually calls `navigator.geolocation` (see `GEO_REQUEST_MARKER` in
 * `webview/injectedScript.ts`) — rather than eagerly on every login, so the OS
 * dialog only ever appears on a page that genuinely needs location.
 *
 * Camera: On Android, `react-native-webview`'s `RNCWebViewModuleImpl` checks
 * `needsCameraPermission()` before launching `onShowFileChooser`. If the
 * `CAMERA` permission is declared in Manifest but not yet granted at runtime,
 * it drops the camera intent (`photoIntent = null`) rather than prompting the
 * user, causing `<input type="file" capture="environment">` to silently fail.
 * Therefore, Android requires lazy priming via `ensureCameraPermission` when
 * entering media-rich pages (e.g. `/chat`, `/complain`) or when the web requests
 * camera/photo attachment (`requestCameraPermission`).
 *
 * Notifications: Android 13+ (API 33) requires an explicit POST_NOTIFICATIONS
 * runtime grant; older Android grants it implicitly.
 */
import { Platform } from 'react-native';
import {
  check,
  request,
  requestNotifications,
  PERMISSIONS,
  RESULTS,
  type Permission,
} from 'react-native-permissions';

function pick(ios: Permission, android: Permission): Permission {
  return Platform.OS === 'ios' ? ios : android;
}

/** Check, then request if undetermined. Returns true when usable. */
async function ensure(permission: Permission): Promise<boolean> {
  try {
    const status = await check(permission);
    if (status === RESULTS.GRANTED || status === RESULTS.LIMITED) return true;
    if (status === RESULTS.BLOCKED || status === RESULTS.UNAVAILABLE) return false;
    const result = await request(permission);
    return result === RESULTS.GRANTED || result === RESULTS.LIMITED;
  } catch (err) {
    console.warn('[permissions] failed for', permission, err);
    return false;
  }
}

export function ensureCameraPermission(): Promise<boolean> {
  return ensure(pick(PERMISSIONS.IOS.CAMERA, PERMISSIONS.ANDROID.CAMERA));
}

export function ensureLocationPermission(): Promise<boolean> {
  return ensure(
    pick(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE, PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION),
  );
}

/**
 * Explicit Android 13+ POST_NOTIFICATIONS request.
 * `requestNotifications` maps to POST_NOTIFICATIONS on Android 13+ and resolves
 * as granted on older Android. No-op (returns true) on iOS, where the APNs
 * permission flow is owned by `push/messaging.ts`.
 */
export async function ensureAndroidPostNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return true;
  const { status } = await requestNotifications(['alert', 'badge', 'sound']);
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
}
