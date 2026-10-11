import { describe, it, expect, jest } from '@jest/globals';

import type { TokenInfo } from '../../native/secureTokenStore';
import type { WebViewHandle, WebViewRegistry } from '../WebViewContext';

describe('멀티 웹뷰 인증 토큰 브로드캐스트 동기화 검증', () => {
  it('broadcastTokenInfo 호출 시 senderId를 제외한 다른 웹뷰에만 토큰이 전달되어야 한다', () => {
    const handles = new Map<string, WebViewHandle>();
    const rootSendTokenInfo = jest.fn();
    const subSendTokenInfo = jest.fn();

    handles.set('root-1', {
      reload: jest.fn(),
      reloadClearCache: jest.fn(),
      goBackSpa: jest.fn(),
      navigateSpa: jest.fn(),
      loadUrl: jest.fn(),
      refreshFcmToken: jest.fn(),
      sendTokenInfo: rootSendTokenInfo,
      sendBroadcastSync: jest.fn(),
    });

    handles.set('sub-2', {
      reload: jest.fn(),
      reloadClearCache: jest.fn(),
      goBackSpa: jest.fn(),
      navigateSpa: jest.fn(),
      loadUrl: jest.fn(),
      refreshFcmToken: jest.fn(),
      sendTokenInfo: subSendTokenInfo,
      sendBroadcastSync: jest.fn(),
    });

    const broadcastTokenInfo = (tokenInfo: TokenInfo, senderId?: string) => {
      for (const [id, handle] of handles) {
        if (!senderId || id !== senderId) {
          handle.sendTokenInfo(tokenInfo);
        }
      }
    };

    const dummyToken: TokenInfo = {
      accessToken: 'access_abc',
      refreshToken: 'refresh_xyz',
      accessTokenExpiredTime: '2026-10-12T00:00:00',
      refreshTokenExpiredTime: '2026-10-19T00:00:00',
    };

    // sub-2 (로그인 창)에서 발생한 토큰 갱신
    broadcastTokenInfo(dummyToken, 'sub-2');

    // root-1(홈 화면)은 전달받아야 함
    expect(rootSendTokenInfo).toHaveBeenCalledTimes(1);
    expect(rootSendTokenInfo).toHaveBeenCalledWith(dummyToken);

    // 발신자인 sub-2는 중복 전달받지 않아야 함
    expect(subSendTokenInfo).not.toHaveBeenCalled();
  });

  it('senderId가 제공되지 않으면 네이티브 자체 갱신으로서 모든 웹뷰에 전달되어야 한다', () => {
    const handles = new Map<string, WebViewHandle>();
    const rootSendTokenInfo = jest.fn();
    const subSendTokenInfo = jest.fn();

    handles.set('root-1', {
      reload: jest.fn(),
      reloadClearCache: jest.fn(),
      goBackSpa: jest.fn(),
      navigateSpa: jest.fn(),
      loadUrl: jest.fn(),
      refreshFcmToken: jest.fn(),
      sendTokenInfo: rootSendTokenInfo,
      sendBroadcastSync: jest.fn(),
    });

    handles.set('sub-2', {
      reload: jest.fn(),
      reloadClearCache: jest.fn(),
      goBackSpa: jest.fn(),
      navigateSpa: jest.fn(),
      loadUrl: jest.fn(),
      refreshFcmToken: jest.fn(),
      sendTokenInfo: subSendTokenInfo,
      sendBroadcastSync: jest.fn(),
    });

    const broadcastTokenInfo = (tokenInfo: TokenInfo, senderId?: string) => {
      for (const [id, handle] of handles) {
        if (!senderId || id !== senderId) {
          handle.sendTokenInfo(tokenInfo);
        }
      }
    };

    const dummyToken: TokenInfo = {
      accessToken: 'access_refreshed',
      refreshToken: 'refresh_refreshed',
      accessTokenExpiredTime: '2026-10-12T00:00:00',
      refreshTokenExpiredTime: '2026-10-19T00:00:00',
    };

    broadcastTokenInfo(dummyToken);

    expect(rootSendTokenInfo).toHaveBeenCalledTimes(1);
    expect(subSendTokenInfo).toHaveBeenCalledTimes(1);
  });
});
