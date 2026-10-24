/**
 * Native-side JWT expiry/refresh, backed by `secureTokenStore`. Lets the
 * shell call authenticated backend endpoints (FCM token registration) without
 * a live WebView — refreshing the access token itself when it's expired.
 *
 * The refresh endpoint rotates both accessToken and refreshToken on every
 * call, and a retired refresh token is rejected outright. Several WebViews
 * booting at once (a notification tap opens the root and a chat sub-page
 * together) used to each refresh with the same token and log the loser out,
 * so a WebView on a shell that advertises `tokenRefresh` asks native to
 * refresh instead (`refreshWithToken`), and native does it once for everyone.
 */
import { API_BASE_URL } from '../config/env';
import { clearTokenInfo, readTokenInfo, saveTokenInfo, type TokenInfo } from './secureTokenStore';

/**
 * Parse a timezone-less "naive" datetime string (e.g.
 * `"2025-01-22T23:25:47.754524713"`) as a device-local `Date`, mirroring the
 * legacy Android client's `LocalDateTime.parse` + `LocalDateTime.now()`
 * comparison. Treating it as UTC (`new Date(str + "Z")`) would compare
 * against the wrong instant on any device not in UTC.
 */
export function parseNaiveLocal(dateTimeStr: string): Date | null {
  const m = dateTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, '0')) : 0;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms);
}

export function isExpired(dateTimeStr: string, now: Date): boolean {
  const expiry = parseNaiveLocal(dateTimeStr);
  return expiry ? now.getTime() >= expiry.getTime() : true;
}

let listener: ((tokenInfo: TokenInfo & { role?: string }) => void) | null = null;

/** Subscribe to native-initiated refreshes, to echo the result back to the
 * live WebView(s). No queue — a refresh with nobody subscribed (fully
 * backgrounded/killed) is fine to drop, the web side reconciles via its own
 * 401 flow next time it runs. */
export function onNativeTokenRefresh(
  cb: (tokenInfo: TokenInfo & { role?: string }) => void,
): () => void {
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}

/** Result of one `/users/refreshToken` round trip, shared by every caller. */
export type RefreshOutcome =
  | { status: 'ok'; tokenInfo: TokenInfo; role: string }
  // The server refused the refresh token — the session is over.
  | { status: 'rejected' }
  // Network failure / 5xx / malformed body — the session may still be fine.
  | { status: 'error' };

/**
 * `exp` claim of a JWT as a naive device-local datetime string, the same
 * shape the rest of the token plumbing compares with `isExpired`. `null` for
 * anything that isn't a decodable JWT.
 */
export function jwtExpiryNaive(token: string): string | null {
  const segment = token.split('.')[1];
  if (!segment) return null;
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const exp = (JSON.parse(atob(padded)) as { exp?: unknown }).exp;
    if (typeof exp !== 'number') return null;
    const d = new Date(exp * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  } catch {
    return null;
  }
}

/**
 * The refresh endpoint rotates the refresh token, so every WebView (and the
 * native FCM path) has to go through this one slot: a second request with the
 * same token while one is in flight joins it, and one arriving just after it
 * finished gets the pair that rotation produced instead of hitting the server
 * with a token it has already retired.
 */
let refreshInFlight: Promise<RefreshOutcome> | null = null;
let lastRotation: { from: string; outcome: Extract<RefreshOutcome, { status: 'ok' }> } | null =
  null;

async function doRefresh(refreshToken: string): Promise<RefreshOutcome> {
  try {
    const res = await fetch(`${API_BASE_URL}/users/refreshToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: `Bearer ${refreshToken}` }),
    });
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // Only forget the stored pair when it is the one that was refused — a
        // caller holding an older, already-rotated token says nothing about it.
        const stored = await readTokenInfo();
        if (stored?.refreshToken === refreshToken) await clearTokenInfo();
        return { status: 'rejected' };
      }
      return { status: 'error' };
    }
    const body = await res.json();
    const accessToken = body.accessToken ?? body.data?.accessToken;
    const nextRefreshToken = body.refreshToken ?? body.data?.refreshToken ?? refreshToken;
    const role = body.role ?? body.data?.role ?? '';
    if (!accessToken) {
      return { status: 'error' };
    }
    // The response carries no expiry times; read them off the JWTs, keeping
    // whatever was stored when a token can't be decoded.
    const stored = await readTokenInfo();
    const newTokenInfo: TokenInfo = {
      accessToken,
      accessTokenExpiredTime:
        jwtExpiryNaive(accessToken) ?? stored?.accessTokenExpiredTime ?? '',
      refreshToken: nextRefreshToken,
      refreshTokenExpiredTime:
        jwtExpiryNaive(nextRefreshToken) ?? stored?.refreshTokenExpiredTime ?? '',
    };
    await saveTokenInfo(newTokenInfo);
    const outcome = { status: 'ok', tokenInfo: newTokenInfo, role } as const;
    lastRotation = { from: refreshToken, outcome };
    listener?.({ ...newTokenInfo, ...(role ? { role } : {}) });
    return outcome;
  } catch (err) {
    console.warn('[authTokens] self-refresh failed', err);
    return { status: 'error' };
  }
}

/**
 * Exchange `refreshToken` for a new pair, at most once per token across the
 * whole app. Used by WebViews (`requestTokenRefresh` bridge request) and by
 * `getValidAccessToken`.
 */
export function refreshWithToken(refreshToken: string): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;
  if (lastRotation?.from === refreshToken) return Promise.resolve(lastRotation.outcome);

  refreshInFlight = doRefresh(refreshToken).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Returns a currently-valid accessToken, refreshing (and persisting) it
 * first if expired. `null` means no usable session — either never synced
 * from the web login, or the refresh token itself is gone/expired.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const stored = await readTokenInfo();
  if (!stored?.accessToken) return null;
  if (!isExpired(stored.accessTokenExpiredTime, new Date())) return stored.accessToken;

  if (!stored.refreshToken || isExpired(stored.refreshTokenExpiredTime, new Date())) {
    await clearTokenInfo();
    return null;
  }
  const outcome = await refreshWithToken(stored.refreshToken);
  return outcome.status === 'ok' ? outcome.tokenInfo.accessToken : null;
}

/** Test-only: reset the single-flight state between test cases. */
export function __resetRefreshStateForTests(): void {
  refreshInFlight = null;
  lastRotation = null;
}
