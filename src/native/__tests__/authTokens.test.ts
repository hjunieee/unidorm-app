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
