import { describe, it, expect, jest } from '@jest/globals';
import { portalUrlFor } from '../../webview/constants';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  StyleSheet: { create: (styles: unknown) => styles },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => {}),
    displayNotification: jest.fn(),
    getDisplayedNotifications: jest.fn(async () => []),
    cancelDisplayedNotifications: jest.fn(),
    onBackgroundEvent: jest.fn(),
    onForegroundEvent: jest.fn(() => () => {}),
    getInitialNotification: jest.fn(async () => null),
  },
  AndroidGroupAlertBehavior: { CHILDREN: 1 },
  AndroidImportance: { HIGH: 4, LOW: 2 },
  AndroidStyle: { BIGTEXT: 1 },
  EventType: { PRESS: 1, DISMISSED: 0 },
}));

jest.mock('@react-native-firebase/messaging', () => {
  const api = { setBackgroundMessageHandler: jest.fn(), onTokenRefresh: jest.fn() };
  const messaging = () => api;
  messaging.AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2 };
  return { __esModule: true, default: messaging };
});

jest.mock('../fcmTokenSync', () => ({ registerFcmTokenRotationListener: jest.fn() }));
jest.mock('../../native/permissions', () => ({ ensureAndroidPostNotifications: jest.fn() }));

import { chatRoomIdOf } from '../messaging';
import { resolveNavIntent } from '../navIntent';

/**
 * UNIDorm-Server의 실제 FcmRoutingType 및 Outbox 발송 스펙과
 * 향후 targetId 통일 규격에 대한 전수 기능 통합 검증 테스트.
 */
describe('FCM 서버 페이로드 연동 및 targetId 전수 기능 검증', () => {
  describe('1. 현행 UNIDorm-Server Outbox 페이로드 정합성 검증', () => {
    it('공지사항 (ANNOUNCEMENT): noticeId 및 path 기반 라우팅', () => {
      const serverPayload = {
        type: 'ANNOUNCEMENT',
        noticeId: '101',
        path: '/announcements/101',
      };
      const intent = resolveNavIntent(serverPayload);
      expect(intent).toEqual({
        kind: 'push',
        path: '/announcements/101',
        url: portalUrlFor('/announcements/101'),
      });
      // 공지는 채팅이 아니므로 chatRoomIdOf는 null이어야 함
      expect(chatRoomIdOf(serverPayload)).toBeNull();
    });

    it('공지사항 path 누락 시: routeMap(type + noticeId) fallback으로 정상 복원', () => {
      const payloadWithoutPath = {
        type: 'ANNOUNCEMENT',
        noticeId: '102',
      };
      const intent = resolveNavIntent(payloadWithoutPath);
      expect(intent).toEqual({
        kind: 'push',
        path: '/announcements/102',
        url: portalUrlFor('/announcements/102'),
      });
    });

    it('민원 (COMPLAINT): complaintId 키 기반 라우팅 복원', () => {
      const serverPayload = {
        type: 'COMPLAINT',
        complaintId: '201',
        path: '/complain/201',
      };
      const intent = resolveNavIntent(serverPayload);
      expect(intent).toEqual({
        kind: 'push',
        path: '/complain/201',
        url: portalUrlFor('/complain/201'),
      });

      // path가 없는 극한의 상황에서도 complaintId로 복원 가능해야 함
      const noPathPayload = {
        type: 'COMPLAINT',
        complaintId: '201',
      };
      expect(resolveNavIntent(noPathPayload)).toEqual({
        kind: 'push',
        path: '/complain/201',
        url: portalUrlFor('/complain/201'),
      });
      expect(chatRoomIdOf(serverPayload)).toBeNull();
    });

    it('룸메이트 모집글 (ROOMMATE_POST): roommatePostId 키 기반 라우팅 복원', () => {
      const serverPayload = {
        type: 'ROOMMATE_POST',
        roommatePostId: '301',
        path: '/roommate/list/301',
      };
      const intent = resolveNavIntent(serverPayload);
      expect(intent).toEqual({
        kind: 'push',
        path: '/roommate/list/301',
        url: portalUrlFor('/roommate/list/301'),
      });

      // path 누락 시 복원
      const noPathPayload = {
        type: 'ROOMMATE_POST',
        roommatePostId: '301',
      };
      expect(resolveNavIntent(noPathPayload)).toEqual({
        kind: 'push',
        path: '/roommate/list/301',
        url: portalUrlFor('/roommate/list/301'),
      });
      expect(chatRoomIdOf(serverPayload)).toBeNull();
    });

    it('오픈채팅 (CHAT_OPEN): chatRoomId 기반 라우팅 및 Notifee 그룹화 ID 추출', () => {
      const serverPayload = {
        type: 'CHAT_OPEN',
        chatRoomId: '401',
        path: '/chat/open/401',
      };
      expect(resolveNavIntent(serverPayload)).toEqual({
        kind: 'push',
        path: '/chat/open/401',
        url: portalUrlFor('/chat/open/401'),
      });
      expect(chatRoomIdOf(serverPayload)).toBe('401');
    });

    it('룸메이트 채팅 (CHAT_ROOMMATE): 서버 레거시 path(/roommate/chat/501) 유입 시에도 웹 실제 라우트(/chat/roommate/501)로 자동 정규화', () => {
      const serverPayload = {
        type: 'CHAT_ROOMMATE',
        chatRoomId: '501',
        path: '/roommate/chat/501',
      };
      expect(resolveNavIntent(serverPayload)).toEqual({
        kind: 'push',
        path: '/chat/roommate/501',
        url: portalUrlFor('/chat/roommate/501'),
      });
      expect(chatRoomIdOf(serverPayload)).toBe('501');
    });

    it('룸메이트 채팅 (CHAT_ROOMMATE): path 누락 시에도 routeMap에서 /chat/roommate/501로 정상 복원', () => {
      const payloadWithoutPath = {
        type: 'CHAT_ROOMMATE',
        chatRoomId: '501',
      };
      expect(resolveNavIntent(payloadWithoutPath)).toEqual({
        kind: 'push',
        path: '/chat/roommate/501',
        url: portalUrlFor('/chat/roommate/501'),
      });
    });
  });

  describe('2. 향후 서버 targetId 공통 키 표준화 선제 대응 검증', () => {
    it('targetId만 단독으로 들어오는 채팅 알림: 라우팅 및 그룹화 동시 성공', () => {
      const unifiedChatPayload = {
        type: 'CHAT',
        targetId: '777',
      };
      expect(resolveNavIntent(unifiedChatPayload)).toEqual({
        kind: 'push',
        path: '/chat/open/777',
        url: portalUrlFor('/chat/open/777'),
      });
      // 핵심: chatRoomId 키가 전혀 없어도 targetId로 그룹화 ID 추출 성공!
      expect(chatRoomIdOf(unifiedChatPayload)).toBe('777');
    });

    it('targetId만 단독으로 들어오는 룸메이트 채팅 알림: /chat/roommate/888 라우팅 및 그룹화 동시 성공', () => {
      const unifiedRoommateChatPayload = {
        type: 'CHAT_ROOMMATE',
        targetId: '888',
      };
      expect(resolveNavIntent(unifiedRoommateChatPayload)).toEqual({
        kind: 'push',
        path: '/chat/roommate/888',
        url: portalUrlFor('/chat/roommate/888'),
      });
      expect(chatRoomIdOf(unifiedRoommateChatPayload)).toBe('888');
    });

    it('targetId만 단독으로 들어오는 민원/공지/룸메이트글 알림: 정상 복원', () => {
      expect(resolveNavIntent({ type: 'COMPLAINT', targetId: '901' })).toEqual({
        kind: 'push',
        path: '/complain/901',
        url: portalUrlFor('/complain/901'),
      });
      expect(resolveNavIntent({ type: 'ANNOUNCEMENT', targetId: '902' })).toEqual({
        kind: 'push',
        path: '/announcements/902',
        url: portalUrlFor('/announcements/902'),
      });
      expect(resolveNavIntent({ type: 'ROOMMATE_POST', targetId: '903' })).toEqual({
        kind: 'push',
        path: '/roommate/list/903',
        url: portalUrlFor('/roommate/list/903'),
      });
    });
  });

  describe('3. 경계값 및 비정상 페이로드 방어 (Edge Cases)', () => {
    it('숫자형 ID (number)가 들어와도 정상적으로 문자열로 정규화되어 라우팅', () => {
      expect(resolveNavIntent({ type: 'CHAT_OPEN', chatRoomId: 12345 })).toEqual({
        kind: 'push',
        path: '/chat/open/12345',
        url: portalUrlFor('/chat/open/12345'),
      });
      expect(chatRoomIdOf({ type: 'CHAT_OPEN', targetId: 12345 })).toBe('12345');
      expect(resolveNavIntent({ type: 'COMPLAINT', complaintId: 67890 })).toEqual({
        kind: 'push',
        path: '/complain/67890',
        url: portalUrlFor('/complain/67890'),
      });
    });

    it('빈 문자열이나 공백 문자열 ID는 거부되고 fallback도 안전하게 무효화', () => {
      expect(resolveNavIntent({ type: 'CHAT_OPEN', chatRoomId: '   ' })).toBeNull();
      expect(resolveNavIntent({ type: 'COMPLAINT', complaintId: '' })).toBeNull();
      expect(chatRoomIdOf({ type: 'CHAT_OPEN', chatRoomId: '   ' })).toBeNull();
      expect(chatRoomIdOf({ type: 'CHAT_OPEN', targetId: '' })).toBeNull();
    });

    it('서버 전체 공지처럼 data 페이로드가 비어있는 경우 null 반환 (앱 홈 유지)', () => {
      expect(resolveNavIntent({})).toBeNull();
      expect(resolveNavIntent(undefined)).toBeNull();
    });
  });
});
