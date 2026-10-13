import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { getFcmTokenWithRetry, requestNotificationPermission } from '../messaging';

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => {}),
    displayNotification: jest.fn(),
    getDisplayedNotifications: jest.fn(async () => []),
    cancelDisplayedNotifications: jest.fn(),
  },
  AndroidImportance: { HIGH: 4, LOW: 2, MIN: 1 },
}));

const mockBroadcastFcmToken = jest.fn();
jest.mock('../fcmTokenSync', () => ({
  broadcastFcmToken: (token: string) => mockBroadcastFcmToken(token),
  registerFcmTokenRotationListener: jest.fn(),
}));

jest.mock('../../native/permissions', () => ({
  ensureAndroidPostNotifications: jest.fn(async () => true),
}));

describe('iOS Messaging Pipeline Verification', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
    const instance = messaging();
    (instance as any).isDeviceRegisteredForRemoteMessages = false;
  });

  afterAll(() => {
    (Platform as any).OS = originalOs;
  });

  it('preemptively calls registerDeviceForRemoteMessages and broadcasts token when authorized', async () => {
    const instance = messaging();
    (instance.registerDeviceForRemoteMessages as any).mockImplementationOnce(() => {
      (instance as any).isDeviceRegisteredForRemoteMessages = true;
      return Promise.resolve();
    });
    (instance.requestPermission as any).mockResolvedValueOnce(1); // AUTHORIZED
    (instance.getToken as any).mockResolvedValueOnce('mock-fcm-token-ios');
    (instance.getAPNSToken as any).mockResolvedValueOnce('mock-apns-token');

    const granted = await requestNotificationPermission();

    expect(granted).toBe(true);
    // registerDeviceForRemoteMessages 선제 호출 검증
    expect(instance.registerDeviceForRemoteMessages).toHaveBeenCalledTimes(1);
    expect(instance.requestPermission).toHaveBeenCalledTimes(1);

    // 비동기 토큰 동기화 작업 대기
    await new Promise((r) => setTimeout(r, 50));

    expect(instance.getToken).toHaveBeenCalled();
    expect(mockBroadcastFcmToken).toHaveBeenCalledWith('mock-fcm-token-ios');
  });

  it('getFcmTokenWithRetry checks APNs token availability on iOS before fetching FCM token', async () => {
    const instance = messaging();
    (instance.getAPNSToken as any).mockResolvedValueOnce('ready-apns-token');
    (instance.getToken as any).mockResolvedValueOnce('mock-fcm-token-ios');

    const token = await getFcmTokenWithRetry(3, 10);

    expect(instance.getAPNSToken).toHaveBeenCalled();
    expect(instance.getToken).toHaveBeenCalled();
    expect(token).toBe('mock-fcm-token-ios');
  });

  it('getFcmTokenWithRetry retries when APNs token is initially not ready', async () => {
    const instance = messaging();
    (instance.getAPNSToken as any)
      .mockResolvedValueOnce(null as any)
      .mockResolvedValueOnce('ready-apns-token');
    (instance.getToken as any).mockResolvedValueOnce('mock-fcm-token-ios');

    const token = await getFcmTokenWithRetry(3, 10);

    expect(instance.getAPNSToken).toHaveBeenCalledTimes(2);
    expect(token).toBe('mock-fcm-token-ios');
  });
});
