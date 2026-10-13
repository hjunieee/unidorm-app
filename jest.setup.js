const originalWarn = console.warn;

console.warn = (...args) => {
  const message = args
    .map((argument) => (typeof argument === 'string' ? argument : String(argument)))
    .join(' ');

  if (message.includes("ExpoModulesCoreJSLogger")) {
    return;
  }

  originalWarn(...args);
};

// The Firebase native module never exists under jest; importing messaging
// throws "Native module RNFBAppModule not found" at module load.
jest.mock('@react-native-firebase/messaging', () => {
  const instance = {
    isDeviceRegisteredForRemoteMessages: false,
    registerDeviceForRemoteMessages: jest.fn(() => Promise.resolve()),
    requestPermission: jest.fn(() => Promise.resolve(1)),
    getAPNSToken: jest.fn(() => Promise.resolve('test-apns-token')),
    getToken: jest.fn(() => Promise.resolve('test-fcm-token')),
    onTokenRefresh: jest.fn(() => jest.fn()),
  };
  const messaging = jest.fn(() => instance);
  messaging.AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 };
  return { __esModule: true, default: messaging };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// react-native-webview native module mock
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

// `src/webview/constants.ts` reads the app version for the User-Agent suffix;
// expo-constants' native lookup (`NativeModules.EXDevLauncher`) throws under jest.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.0.0-test' } },
}));
