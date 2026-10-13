import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Platform } from 'react-native';
import * as RNPermissions from 'react-native-permissions';

jest.mock('react-native-permissions', () => require('react-native-permissions/mock'));

import {
  ensureCameraPermission,
  ensureLocationPermission,
  ensureAndroidPostNotifications,
} from '../permissions';

describe('native permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureCameraPermission', () => {
    it('returns true if permission is already granted', async () => {
      jest.spyOn(RNPermissions, 'check').mockResolvedValueOnce(RNPermissions.RESULTS.GRANTED);

      const result = await ensureCameraPermission();

      expect(result).toBe(true);
      expect(RNPermissions.check).toHaveBeenCalled();
    });

    it('requests permission if status is denied and resolves true on grant', async () => {
      jest.spyOn(RNPermissions, 'check').mockResolvedValueOnce(RNPermissions.RESULTS.DENIED);
      jest.spyOn(RNPermissions, 'request').mockResolvedValueOnce(RNPermissions.RESULTS.GRANTED);

      const result = await ensureCameraPermission();

      expect(result).toBe(true);
      expect(RNPermissions.request).toHaveBeenCalled();
    });

    it('returns false if permission is blocked without prompting', async () => {
      jest.spyOn(RNPermissions, 'check').mockResolvedValueOnce(RNPermissions.RESULTS.BLOCKED);
      const requestSpy = jest.spyOn(RNPermissions, 'request');

      const result = await ensureCameraPermission();

      expect(result).toBe(false);
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('returns false if permission request rejects or throws', async () => {
      jest.spyOn(RNPermissions, 'check').mockRejectedValueOnce(new Error('OS error'));

      const result = await ensureCameraPermission();

      expect(result).toBe(false);
    });
  });

  describe('ensureLocationPermission', () => {
    it('returns true if location is already granted', async () => {
      jest.spyOn(RNPermissions, 'check').mockResolvedValueOnce(RNPermissions.RESULTS.GRANTED);

      const result = await ensureLocationPermission();

      expect(result).toBe(true);
    });
  });

  describe('ensureAndroidPostNotifications', () => {
    it('returns true without requesting on iOS', async () => {
      Platform.OS = 'ios';
      const reqSpy = jest.spyOn(RNPermissions, 'requestNotifications');

      const result = await ensureAndroidPostNotifications();

      expect(result).toBe(true);
      expect(reqSpy).not.toHaveBeenCalled();
    });
  });
});
