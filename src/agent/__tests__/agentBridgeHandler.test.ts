import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as ScreenCapture from 'expo-screen-capture';
import { handleAgentBridgeMessage, AgentBridgeResponse } from '../agentBridgeHandler';
import { PortalSecureStore } from '../secureStore';

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockImplementation(() => Promise.resolve()),
  allowScreenCaptureAsync: jest.fn().mockImplementation(() => Promise.resolve()),
}));

jest.mock('../secureStore', () => ({
  PortalSecureStore: {
    getCredentials: jest.fn(),
    saveCredentials: jest.fn(),
    clearCredentials: jest.fn(),
  },
}));

jest.mock('../academicWorker', () => ({
  fetchAcademicInfoLocally: jest.fn(),
}));

jest.mock('../agentActionExecutor', () => ({
  executeAgentAction: jest.fn(),
}));

describe('agentBridgeHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('setScreenCapturePrevented: enabled=true 일 때 preventScreenCaptureAsync()를 실제로 호출한다', async () => {
    let capturedResponse: AgentBridgeResponse | null = null;
    const raw = JSON.stringify({
      type: 'setScreenCapturePrevented',
      payload: { enabled: true },
    });

    const handled = await handleAgentBridgeMessage(raw, (res) => {
      capturedResponse = res;
    });

    expect(handled).toBe(true);
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(ScreenCapture.allowScreenCaptureAsync).not.toHaveBeenCalled();
    expect(capturedResponse).toEqual({
      type: 'setScreenCapturePreventedResult',
      success: true,
      data: { enabled: true },
    });
  });

  it('setScreenCapturePrevented: enabled=false 일 때 allowScreenCaptureAsync()를 실제로 호출한다', async () => {
    let capturedResponse: AgentBridgeResponse | null = null;
    const raw = JSON.stringify({
      type: 'setScreenCapturePrevented',
      payload: { enabled: false },
    });

    const handled = await handleAgentBridgeMessage(raw, (res) => {
      capturedResponse = res;
    });

    expect(handled).toBe(true);
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled();
    expect(capturedResponse).toEqual({
      type: 'setScreenCapturePreventedResult',
      success: true,
      data: { enabled: false },
    });
  });

  it('checkPortalAccount: 등록된 계정 정보를 조회하여 정상 응답한다', async () => {
    (PortalSecureStore.getCredentials as any).mockResolvedValueOnce({
      studentId: '202612345',
      password: 'secretPassword',
    });

    let capturedResponse: AgentBridgeResponse | null = null;
    const raw = JSON.stringify({
      type: 'checkPortalAccount',
    });

    const handled = await handleAgentBridgeMessage(raw, (res) => {
      capturedResponse = res;
    });

    expect(handled).toBe(true);
    expect(capturedResponse).toEqual({
      type: 'checkPortalAccountResult',
      success: true,
      data: { linked: true, studentId: '202612345' },
    });
  });

  it('savePortalAccount: 포털 계정을 SecureStore에 저장한다', async () => {
    (PortalSecureStore.saveCredentials as any).mockResolvedValueOnce(undefined);

    let capturedResponse: AgentBridgeResponse | null = null;
    const raw = JSON.stringify({
      type: 'savePortalAccount',
      payload: { studentId: '202612345', password: 'testPassword' },
    });

    const handled = await handleAgentBridgeMessage(raw, (res) => {
      capturedResponse = res;
    });

    expect(handled).toBe(true);
    expect(PortalSecureStore.saveCredentials).toHaveBeenCalledWith({
      studentId: '202612345',
      password: 'testPassword',
    });
    expect(capturedResponse).toEqual({
      type: 'savePortalAccountResult',
      success: true,
      data: { linked: true },
    });
  });
});
