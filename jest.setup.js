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
    getToken: jest.fn(() => Promise.resolve('test-fcm-token')),
    onTokenRefresh: jest.fn(() => jest.fn()),
  };
  const messaging = jest.fn(() => instance);
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
