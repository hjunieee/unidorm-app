import { describe, it, expect, beforeEach } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

import { PortalSecureStore } from '../secureStore';

const store = new Map<string, string>();
const secureStore = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

beforeEach(() => {
  store.clear();
  secureStore.getItemAsync.mockImplementation(async (key: string) => store.get(key) ?? null);
  secureStore.setItemAsync.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  secureStore.deleteItemAsync.mockImplementation(async (key: string) => {
    store.delete(key);
  });
});

describe('PortalSecureStore', () => {
  it('moves credentials saved under the pre-rename keys and returns them', async () => {
    store.set('intip_portal_student_id', '202600001');
    store.set('intip_portal_password', 'pw');

    expect(await PortalSecureStore.getCredentials()).toEqual({
      studentId: '202600001',
      password: 'pw',
    });
    expect(store.get('unidorm_portal_student_id')).toBe('202600001');
    expect(store.get('unidorm_portal_password')).toBe('pw');
    expect(store.has('intip_portal_student_id')).toBe(false);
    expect(store.has('intip_portal_password')).toBe(false);
  });

  it('prefers the current keys and leaves nothing to migrate', async () => {
    await PortalSecureStore.saveCredentials({ studentId: '202600002', password: 'new' });

    expect(await PortalSecureStore.getCredentials()).toEqual({
      studentId: '202600002',
      password: 'new',
    });
  });

  it('returns null when neither set of keys holds credentials', async () => {
    expect(await PortalSecureStore.getCredentials()).toBeNull();
  });

  it('clears both the current and the pre-rename keys', async () => {
    store.set('unidorm_portal_student_id', 'a');
    store.set('unidorm_portal_password', 'b');
    store.set('intip_portal_student_id', 'c');
    store.set('intip_portal_password', 'd');

    await PortalSecureStore.clearCredentials();

    expect(store.size).toBe(0);
  });
});
