import * as SecureStore from 'expo-secure-store';

const KEY_PORTAL_ID = 'unidorm_portal_student_id';
const KEY_PORTAL_PW = 'unidorm_portal_password';

/**
 * Key names used by app builds released before the rename. Credentials saved
 * there are moved to the keys above the first time they're read, so users
 * don't have to re-enter their portal account. Safe to delete once no
 * installed build can still be holding them.
 */
const LEGACY_KEY_PORTAL_ID = 'intip_portal_student_id';
const LEGACY_KEY_PORTAL_PW = 'intip_portal_password';

const KEYCHAIN_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** Move credentials from the legacy keys, if that's where they still are. */
async function migrateLegacyCredentials(): Promise<void> {
  const [studentId, password] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_KEY_PORTAL_ID),
    SecureStore.getItemAsync(LEGACY_KEY_PORTAL_PW),
  ]);
  if (!studentId || !password) return;

  await SecureStore.setItemAsync(KEY_PORTAL_ID, studentId, KEYCHAIN_OPTIONS);
  await SecureStore.setItemAsync(KEY_PORTAL_PW, password, KEYCHAIN_OPTIONS);
  // Only drop the old copy once the new one is written.
  await SecureStore.deleteItemAsync(LEGACY_KEY_PORTAL_ID);
  await SecureStore.deleteItemAsync(LEGACY_KEY_PORTAL_PW);
}

export interface PortalCredentials {
  studentId: string;
  password: string;
}

/**
 * 사용자 포털 학번 및 비밀번호를 기기 하드웨어 보안 영역(iOS Keychain / Android KeyStore)에
 * 안전하게 암호화하여 저장/조회/삭제하는 모듈.
 * (유니돔 서버로는 절대 전송되지 않음)
 */
export const PortalSecureStore = {
  async saveCredentials(credentials: PortalCredentials): Promise<void> {
    const { studentId, password } = credentials;
    if (!studentId || !password) {
      throw new Error('학번과 비밀번호를 모두 입력해 주세요.');
    }

    await SecureStore.setItemAsync(KEY_PORTAL_ID, studentId.trim(), KEYCHAIN_OPTIONS);
    await SecureStore.setItemAsync(KEY_PORTAL_PW, password.trim(), KEYCHAIN_OPTIONS);
  },

  async getCredentials(): Promise<PortalCredentials | null> {
    let studentId = await SecureStore.getItemAsync(KEY_PORTAL_ID);
    let password = await SecureStore.getItemAsync(KEY_PORTAL_PW);

    if (!studentId || !password) {
      await migrateLegacyCredentials();
      studentId = await SecureStore.getItemAsync(KEY_PORTAL_ID);
      password = await SecureStore.getItemAsync(KEY_PORTAL_PW);
    }

    if (!studentId || !password) {
      return null;
    }

    return { studentId, password };
  },

  async hasCredentials(): Promise<boolean> {
    const creds = await this.getCredentials();
    return creds !== null;
  },

  async clearCredentials(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY_PORTAL_ID);
    await SecureStore.deleteItemAsync(KEY_PORTAL_PW);
    await SecureStore.deleteItemAsync(LEGACY_KEY_PORTAL_ID);
    await SecureStore.deleteItemAsync(LEGACY_KEY_PORTAL_PW);
  },
};
