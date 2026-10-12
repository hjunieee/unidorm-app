import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const mockGetValidAccessToken = jest.fn<() => Promise<string | null>>();
jest.mock('../../native/authTokens', () => ({
  getValidAccessToken: () => mockGetValidAccessToken(),
}));

let tokenRefreshCallback: ((token: string) => void) | null = null;
jest.mock('@react-native-firebase/messaging', () => {
  const api = {
    onTokenRefresh: jest.fn((cb: (token: string) => void) => {
      tokenRefreshCallback = cb;
      return jest.fn();
    }),
  };
  return { __esModule: true, default: () => api };
});

describe('fcmTokenSync', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    mockGetValidAccessToken.mockReset();
    tokenRefreshCallback = null;
  });

  it('posts rotated FCM token to /fcm/token with Bearer token and fcmToken body', async () => {
    mockGetValidAccessToken.mockResolvedValue('jwt-token-123');
    mockFetch.mockResolvedValue({ ok: true } as Response);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerFcmTokenRotationListener } = require('../fcmTokenSync') as typeof import('../fcmTokenSync');
    registerFcmTokenRotationListener();

    expect(tokenRefreshCallback).not.toBeNull();
    tokenRefreshCallback!('new-fcm-token');

    // Wait for the async tryRegisterFcmToken to resolve
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/fcm/token');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer jwt-token-123');
    expect(JSON.parse(init?.body as string)).toEqual({ fcmToken: 'new-fcm-token' });
  });

  it('queues pending token when logged out and flushes upon flushPendingFcmToken', async () => {
    mockGetValidAccessToken.mockResolvedValueOnce(null); // not logged in

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerFcmTokenRotationListener, flushPendingFcmToken } = require('../fcmTokenSync') as typeof import('../fcmTokenSync');
    registerFcmTokenRotationListener();

    tokenRefreshCallback!('queued-token');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetch).not.toHaveBeenCalled();

    // Now user logs in, flush pending token
    mockGetValidAccessToken.mockResolvedValue('jwt-after-login');
    mockFetch.mockResolvedValue({ ok: true } as Response);

    flushPendingFcmToken();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/fcm/token');
    expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer jwt-after-login');
    expect(JSON.parse(init?.body as string)).toEqual({ fcmToken: 'queued-token' });
  });
});
