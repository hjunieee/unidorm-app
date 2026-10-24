import { describe, it, expect } from '@jest/globals';
import { isExpired, parseNaiveLocal } from '../authTokens';

describe('parseNaiveLocal', () => {
  it('parses a naive datetime as device-local time, not UTC', () => {
    const parsed = parseNaiveLocal('2025-01-22T23:25:47.754524713');
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(new Date(2025, 0, 22, 23, 25, 47, 754));
  });

  it('parses without a fractional-seconds component', () => {
    const parsed = parseNaiveLocal('2025-01-22T23:25:47');
    expect(parsed).toEqual(new Date(2025, 0, 22, 23, 25, 47, 0));
  });

  it('returns null for an unparseable string', () => {
    expect(parseNaiveLocal('not-a-date')).toBeNull();
    expect(parseNaiveLocal('')).toBeNull();
  });
});

describe('isExpired', () => {
  it('is false when the expiry is in the future', () => {
    const now = new Date(2025, 0, 22, 12, 0, 0);
    expect(isExpired('2025-01-22T23:25:47.754', now)).toBe(false);
  });

  it('is true when the expiry is in the past', () => {
    const now = new Date(2025, 0, 23, 0, 0, 0);
    expect(isExpired('2025-01-22T23:25:47.754', now)).toBe(true);
  });

  it('treats an unparseable expiry as expired (fail safe)', () => {
    expect(isExpired('garbage', new Date())).toBe(true);
  });
});

describe('getValidAccessToken', () => {
  const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('refreshes expired access token using /users/refreshToken and returns new token', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const secureTokenStore = require('../secureTokenStore') as {
      readTokenInfo: () => Promise<unknown>;
      saveTokenInfo: (t: unknown) => Promise<void>;
    };
    jest.spyOn(secureTokenStore, 'readTokenInfo').mockResolvedValue({
      accessToken: 'old-access-token',
      accessTokenExpiredTime: '2020-01-01T00:00:00', // expired
      refreshToken: 'valid-refresh-token',
      refreshTokenExpiredTime: '2099-01-01T00:00:00',
    });
    jest.spyOn(secureTokenStore, 'saveTokenInfo').mockResolvedValue();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: 'new-refreshed-token',
        refreshToken: 'new-refresh-token',
      }),
    } as Response);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getValidAccessToken } = require('../authTokens') as typeof import('../authTokens');
    const token = await getValidAccessToken();

    expect(token).toBe('new-refreshed-token');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/users/refreshToken');
    expect(JSON.parse(init?.body as string)).toEqual({
      refreshToken: 'Bearer valid-refresh-token',
    });
  });
});

describe('refreshWithToken', () => {
  const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const secureTokenStore = require('../secureTokenStore') as {
    readTokenInfo: () => Promise<unknown>;
    saveTokenInfo: (t: unknown) => Promise<void>;
    clearTokenInfo: () => Promise<void>;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const authTokens = require('../authTokens') as typeof import('../authTokens');

  const okResponse = (accessToken: string, refreshToken: string) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken, refreshToken, role: 'ROLE_USER' }),
    }) as Response;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch;
    authTokens.__resetRefreshStateForTests();
    jest.spyOn(secureTokenStore, 'readTokenInfo').mockResolvedValue({
      accessToken: 'old-access',
      accessTokenExpiredTime: '2020-01-01T00:00:00',
      refreshToken: 'old-refresh',
      refreshTokenExpiredTime: '2099-01-01T00:00:00',
    });
    jest.spyOn(secureTokenStore, 'saveTokenInfo').mockResolvedValue();
    jest.spyOn(secureTokenStore, 'clearTokenInfo').mockResolvedValue();
  });

  it('joins concurrent requests for the same token into one server call', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('new-access', 'new-refresh'));

    const [a, b] = await Promise.all([
      authTokens.refreshWithToken('old-refresh'),
      authTokens.refreshWithToken('old-refresh'),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: 'ok', role: 'ROLE_USER' });
  });

  it('answers a late request with the already-rotated token from the last rotation', async () => {
    mockFetch.mockResolvedValueOnce(okResponse('new-access', 'new-refresh'));

    await authTokens.refreshWithToken('old-refresh');
    const late = await authTokens.refreshWithToken('old-refresh');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(late).toMatchObject({
      status: 'ok',
      tokenInfo: { accessToken: 'new-access', refreshToken: 'new-refresh' },
    });
  });

  it('reports a refused refresh token as rejected and clears the stored pair', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const outcome = await authTokens.refreshWithToken('old-refresh');

    expect(outcome).toEqual({ status: 'rejected' });
    expect(secureTokenStore.clearTokenInfo).toHaveBeenCalled();
  });

  it('keeps the stored pair when an unrelated, older token is refused', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    await authTokens.refreshWithToken('some-older-refresh');

    expect(secureTokenStore.clearTokenInfo).not.toHaveBeenCalled();
  });

  it('reports server errors as error, not rejected', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    expect(await authTokens.refreshWithToken('old-refresh')).toEqual({ status: 'error' });
  });

  it('stores the expiry times read from the new JWTs', async () => {
    const exp = Math.floor(new Date(2030, 5, 1, 9, 30, 0).getTime() / 1000);
    const jwt = `x.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.y`;
    mockFetch.mockResolvedValueOnce(okResponse(jwt, jwt));

    await authTokens.refreshWithToken('old-refresh');

    expect(secureTokenStore.saveTokenInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTokenExpiredTime: '2030-06-01T09:30:00',
        refreshTokenExpiredTime: '2030-06-01T09:30:00',
      }),
    );
  });
});
