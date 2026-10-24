import { PortalSecureStore } from './secureStore';
import { AcademicScraperManager } from './AcademicScraperWebView';
import { saveDownload } from '../native/downloads';

/**
 * AI 에이전트로부터 하달되는 범용 액션 명령 규격 (Generic Protocol)
 */
export interface ClientActionInstruction {
  actionId: string;
  authDomain: 'LIBRARY' | 'PORTAL' | 'LMS' | 'DORM' | 'NONE';
  actionType?: 'QUERY' | 'MUTATION' | 'DOWNLOAD';
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  downloadMetadata?: {
    file_name?: string;
    fileName?: string;
    mime_type?: string;
    mimeType?: string;
  };
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    headers?: Record<string, string>;
    body?: any;
    bodyTemplate?: any;
    params?: Record<string, string | number | boolean>;
  };
}

/**
 * 액션 실행 결과 보고 규격
 */
export interface ClientActionResult {
  actionId: string;
  success: boolean;
  statusCode?: number;
  data?: any;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * 범용 클라이언트 액션 실행 엔진 (Agent Action Executor)
 * 특정 도메인 비즈니스 로직에 종속되지 않고, authDomain에 맞춰 인증 정보를 자동 주입하여 요청을 수행.
 */
export async function executeAgentAction(
  instruction: ClientActionInstruction
): Promise<ClientActionResult> {
  const { actionId, authDomain, request } = instruction;

  try {
    // 0. 포털 ERP (Nexacro SSV) 전용 액션 처리 (기숙사 DORM 포함)
    if (authDomain === 'PORTAL' || authDomain === 'DORM') {
      const creds = await PortalSecureStore.getCredentials();
      if (!creds) {
        return {
          actionId,
          success: false,
          errorCode: 'AUTH_REQUIRED',
          errorMessage: '포털 로그인이 필요합니다.',
        };
      }

      // 보안 검증 1: target URL이 대학교 ERP/포털 호스트인지 확인 (SSRF 방어)
      if (request.url) {
        try {
          const parsedTarget = new URL(request.url, 'https://erp.inu.ac.kr:8443');
          if (!['erp.inu.ac.kr', 'portal.inu.ac.kr'].includes(parsedTarget.hostname)) {
            return {
              actionId,
              success: false,
              errorCode: 'UNAUTHORIZED_TARGET',
              errorMessage: '허가되지 않은 외부 시스템 대상 액션입니다.',
            };
          }
        } catch (_) {}
      }

      // 보안 검증 2: stuno/persNo 파라미터가 포함된 경우 로그인된 본인 학번으로 강제 바인딩 (BOLA/IDOR 방어)
      const safeRequest: any = { ...request };
      if (safeRequest.params && typeof safeRequest.params === 'object') {
        const nextParams = { ...safeRequest.params };
        if ('stuno' in nextParams) nextParams.stuno = creds.studentId;
        if ('persNo' in nextParams) nextParams.persNo = creds.studentId;
        safeRequest.params = nextParams;
      }
      if (safeRequest.data && typeof safeRequest.data === 'object') {
        const nextData = { ...safeRequest.data };
        if ('stuno' in nextData) nextData.stuno = creds.studentId;
        if ('persNo' in nextData) nextData.persNo = creds.studentId;
        safeRequest.data = nextData;
      }

      try {
        const rawResult = await AcademicScraperManager.executeErpAction({
          creds,
          actionId,
          target: safeRequest,
        });

        let parsedData: any = rawResult;
        try {
          parsedData = JSON.parse(rawResult);
        } catch (_) {}

        return {
          actionId,
          success: true,
          statusCode: 200,
          data: parsedData,
        };
      } catch (scrapeErr: any) {
        return {
          actionId,
          success: false,
          errorCode: 'ERP_SCRAPE_ERROR',
          errorMessage: scrapeErr?.message || '포털 ERP 데이터 조회 실패',
        };
      }
    }
    let finalUrl = request.url;
    if (request.params && Object.keys(request.params).length > 0) {
      const urlObj = new URL(request.url);
      Object.entries(request.params).forEach(([key, val]) => {
        urlObj.searchParams.append(key, String(val));
      });
      finalUrl = urlObj.toString();
    }

    // 0-1. 파일 다운로드 (DOWNLOAD) 전용 액션 처리
    if (instruction.actionType === 'DOWNLOAD' || instruction.downloadMetadata) {
      const suggestedName =
        instruction.downloadMetadata?.file_name ||
        instruction.downloadMetadata?.fileName ||
        'download_file';
      await saveDownload(finalUrl, suggestedName);
      return {
        actionId,
        success: true,
        statusCode: 200,
        data: {
          downloaded: true,
          fileName: suggestedName,
          message: `${suggestedName} 다운로드가 완료되었습니다.`,
        },
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 UNIDorm-Mobile',
      ...(request.headers || {}),
    };

    // 1. HTTP 요청 실행
    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) {
      fetchOptions.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    }

    const response = await fetch(finalUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    let resData: any = null;
    if (contentType.includes('application/json')) {
      resData = await response.json().catch(() => null);
    } else {
      resData = await response.text().catch(() => null);
    }

    let isSuccess = response.ok && (!resData || resData.success !== false);

    return {
      actionId,
      success: isSuccess,
      statusCode: response.status,
      data: resData,
      errorCode: isSuccess ? undefined : (resData?.code || resData?.errorcode || `HTTP_${response.status}`),
      errorMessage: isSuccess ? undefined : (resData?.message || resData?.error || response.statusText),
    };
  } catch (error: any) {
    return {
      actionId,
      success: false,
      errorCode: 'NETWORK_EXCEPTION',
      errorMessage: error?.message || '네트워크 통신 중 오류가 발생했습니다.',
    };
  }
}
