import { Linking } from 'react-native';
import { router } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { PortalSecureStore } from './secureStore';
import { fetchAcademicInfoLocally } from './academicWorker';
import { executeAgentAction } from './agentActionExecutor';

export interface AgentBridgeResponse {
  type: string;
  requestId?: string;
  success: boolean;
  data?: any;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * AI 에이전트 관련 브릿지 메시지 핸들러
 * 메시지가 에이전트 액션인 경우 처리 후 true 반환, 아니면 false 반환
 */
export async function handleAgentBridgeMessage(
  raw: string,
  sendResponse: (res: AgentBridgeResponse) => void
): Promise<boolean> {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
    return false;
  }

  const { type, payload } = parsed;
  const targetRequestId = parsed.requestId || payload?.instruction?.actionId;

  // 모든 응답에 요청 고유 ID(requestId)를 동기화하여 다중 비동기 브릿지 호출 시 충돌/혼선 방지
  const sendWrappedResponse = (res: AgentBridgeResponse) => {
    sendResponse({
      ...res,
      ...(targetRequestId ? { requestId: targetRequestId } : {}),
    });
  };

  switch (type) {
    case 'checkPortalAccount': {
      try {
        const creds = await PortalSecureStore.getCredentials();
        sendWrappedResponse({
          type: 'checkPortalAccountResult',
          success: true,
          data: { linked: Boolean(creds?.studentId), studentId: creds?.studentId || '' },
        });
      } catch (err: any) {
        sendWrappedResponse({
          type: 'checkPortalAccountResult',
          success: false,
          errorMessage: err?.message,
        });
      }
      return true;
    }

    case 'savePortalAccount': {
      try {
        const { studentId, password } = payload || {};
        await PortalSecureStore.saveCredentials({ studentId, password });
        sendWrappedResponse({
          type: 'savePortalAccountResult',
          success: true,
          data: { linked: true },
        });
      } catch (err: any) {
        sendWrappedResponse({
          type: 'savePortalAccountResult',
          success: false,
          errorMessage: err?.message,
        });
      }
      return true;
    }

    case 'deletePortalAccount': {
      try {
        await PortalSecureStore.clearCredentials();
        sendWrappedResponse({
          type: 'deletePortalAccountResult',
          success: true,
          data: { linked: false },
        });
      } catch (err: any) {
        sendWrappedResponse({
          type: 'deletePortalAccountResult',
          success: false,
          errorMessage: err?.message,
        });
      }
      return true;
    }

    case 'fetchAcademicInfo': {
      try {
        const result = await fetchAcademicInfoLocally();
        sendWrappedResponse({
          type: 'fetchAcademicInfoResult',
          success: result.success,
          data: result.rawSsv ? { rawSsv: result.rawSsv } : undefined,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        });
      } catch (err: any) {
        sendWrappedResponse({
          type: 'fetchAcademicInfoResult',
          success: false,
          errorCode: 'NETWORK_ERROR',
          errorMessage: err?.message || '학적 정보 조회 실패',
        });
      }
      return true;
    }

    case 'executeAgentAction': {
      try {
        const instruction = payload?.instruction;
        if (!instruction) {
          throw new Error('instruction 파라미터가 누락되었습니다.');
        }
        const actionResult = await executeAgentAction(instruction);
        sendWrappedResponse({
          type: 'executeAgentActionResult',
          success: actionResult.success,
          data: actionResult.data !== undefined ? actionResult.data : actionResult,
          errorCode: actionResult.errorCode,
          errorMessage: actionResult.errorMessage,
        });
      } catch (err: any) {
        sendWrappedResponse({
          type: 'executeAgentActionResult',
          success: false,
          errorCode: 'EXECUTION_ERROR',
          errorMessage: err?.message,
        });
      }
      return true;
    }

    case 'openUrl':
    case 'OPEN_URL':
    case 'NAVIGATE': {
      const targetUrl = payload?.url || parsed?.url || payload?.path || parsed?.path;
      if (typeof targetUrl === 'string' && targetUrl.trim()) {
        const cleanUrl = targetUrl.trim();
        console.log('[agentBridgeHandler] Handling navigation/openUrl:', cleanUrl);
        try {
          if (cleanUrl.startsWith('tel:') || cleanUrl.startsWith('mailto:')) {
            await Linking.openURL(cleanUrl);
          } else if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
            await Linking.openURL(cleanUrl);
          } else {
            router.push(cleanUrl as any);
          }
          sendWrappedResponse({
            type: `${type}Result`,
            success: true,
            data: { url: cleanUrl },
          });
        } catch (err: any) {
          console.warn('[agentBridgeHandler] Failed to open URL:', cleanUrl, err);
          sendWrappedResponse({
            type: `${type}Result`,
            success: false,
            errorMessage: err?.message || '링크 이동 실패',
          });
        }
      }
      return true;
    }

    case 'setScreenCapturePrevented': {
      const enabled = Boolean(payload?.enabled);
      console.log('[agentBridgeHandler] Screen capture prevention requested:', enabled);
      try {
        if (enabled) {
          await ScreenCapture.preventScreenCaptureAsync();
        } else {
          await ScreenCapture.allowScreenCaptureAsync();
        }
        sendWrappedResponse({
          type: 'setScreenCapturePreventedResult',
          success: true,
          data: { enabled },
        });
      } catch (err: any) {
        console.warn('[agentBridgeHandler] Failed to toggle screen capture:', err);
        sendWrappedResponse({
          type: 'setScreenCapturePreventedResult',
          success: false,
          errorMessage: err?.message,
        });
      }
      return true;
    }

    default:
      return false;
  }
}
