/**
 * Relays rotated FCM tokens to active WebView container(s).
 *
 * In UNIDorm's web-centered architecture, the web SPA (UNIDorm-web) owns
 * session authentication and registers FCM tokens with the backend
 * (via window.onReceiveFcmToken -> POST /fcm/token).
 *
 * This module listens to Firebase's `onTokenRefresh` and broadcasts
 * the new token to active WebViews, eliminating native direct HTTP calls
 * and preventing duplicate registration race conditions.
 */
import messaging from '@react-native-firebase/messaging';

type TokenRefreshListener = (token: string) => void;

const listeners = new Set<TokenRefreshListener>();
let latestRotatedToken: string | null = null;
let rotationRegistered = false;

/**
 * Subscribe to FCM token rotation events.
 * Returns an unsubscribe callback.
 */
export function onFcmTokenRefresh(listener: TokenRefreshListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Returns the most recently rotated FCM token, if any. */
export function getLatestRotatedToken(): string | null {
  return latestRotatedToken;
}

/**
 * Broadcasts an FCM token to all active listeners.
 * Used for initial token acquisition after permission grant or token refresh.
 */
export function broadcastFcmToken(token: string): void {
  latestRotatedToken = token;
  listeners.forEach((listener) => {
    try {
      listener(token);
    } catch (err) {
      console.warn('[fcmTokenSync] listener error', err);
    }
  });
}

/**
 * Registers the `onTokenRefresh` listener once.
 * Called from `registerBackgroundHandlers()` so it is active before React renders.
 */
export function registerFcmTokenRotationListener(): void {
  if (rotationRegistered) return;
  rotationRegistered = true;
  messaging().onTokenRefresh((token) => {
    broadcastFcmToken(token);
  });
}
