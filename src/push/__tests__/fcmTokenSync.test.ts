import { beforeEach, describe, expect, it, jest } from '@jest/globals';

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

describe('fcmTokenSync (Web Unification)', () => {
  beforeEach(() => {
    jest.resetModules();
    tokenRefreshCallback = null;
  });

  it('notifies registered listeners and records latest rotated token', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      registerFcmTokenRotationListener,
      onFcmTokenRefresh,
      getLatestRotatedToken,
    } = require('../fcmTokenSync') as typeof import('../fcmTokenSync');

    const listener = jest.fn();
    const unsub = onFcmTokenRefresh(listener);

    registerFcmTokenRotationListener();

    expect(tokenRefreshCallback).not.toBeNull();
    tokenRefreshCallback!('rotated-token-123');

    expect(listener).toHaveBeenCalledWith('rotated-token-123');
    expect(getLatestRotatedToken()).toBe('rotated-token-123');

    unsub();
    tokenRefreshCallback!('rotated-token-456');
    expect(listener).toHaveBeenCalledTimes(1); // not called again after unsub
    expect(getLatestRotatedToken()).toBe('rotated-token-456');
  });

  it('safely handles errors in subscriber callbacks without crashing', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      registerFcmTokenRotationListener,
      onFcmTokenRefresh,
    } = require('../fcmTokenSync') as typeof import('../fcmTokenSync');

    const faultyListener = jest.fn(() => {
      throw new Error('boom');
    });
    const goodListener = jest.fn();

    onFcmTokenRefresh(faultyListener);
    onFcmTokenRefresh(goodListener);

    registerFcmTokenRotationListener();
    tokenRefreshCallback!('token-abc');

    expect(faultyListener).toHaveBeenCalledWith('token-abc');
    expect(goodListener).toHaveBeenCalledWith('token-abc');
  });
});
