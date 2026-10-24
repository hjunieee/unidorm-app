import type { RefObject } from "react";
import type WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { PlatformChannel, type ChannelOptions, type Transport } from "../channel";
import { NativeToWeb, WebToNative } from "../messages";

/**
 * 네이티브(unidorm-app)용 채널.
 *
 *  - 보냄(Native -> Web): `webViewRef.current.postMessage(raw)`
 *    → 웹의 'message' 이벤트로 도착 (web 어댑터가 구독).
 *  - 받음(Web -> Native): `<WebView onMessage={...} />` 프롭.
 *    채널이 직접 프롭을 구독할 수 없으므로 `onMessage` 핸들러를 함께 반환한다.
 */

/** 네이티브 → 웹으로 보내고, 웹 → 네이티브를 받는 채널. */
export type NativeChannel = PlatformChannel<NativeToWeb, WebToNative>;

export interface NativeChannelHandle {
  channel: NativeChannel;
  /** `<WebView onMessage={onMessage} />` 에 그대로 연결한다. */
  onMessage: (event: WebViewMessageEvent) => void;
}

function createNativeTransport(webViewRef: RefObject<WebView | null>): {
  transport: Transport;
  emit: (raw: string) => void;
} {
  let inbound: ((raw: string) => void) | null = null;
  return {
    transport: {
      post(raw) {
        webViewRef.current?.postMessage(raw);
      },
      setInbound(onRaw) {
        inbound = onRaw;
        return () => {
          if (inbound === onRaw) inbound = null;
        };
      },
    },
    emit: (raw) => inbound?.(raw),
  };
}

/**
 * 네이티브용 PlatformChannel 과, WebView 의 onMessage 에 연결할 핸들러를 생성한다.
 *
 * @example
 * const { channel, onMessage } = createNativeChannel(webViewRef);
 * channel.on("navigateTo", ({ path, url }) => pushWebView(url));
 * channel.send("receiveFcmToken", token);
 * // <WebView ref={webViewRef} onMessage={onMessage} />
 */
export function createNativeChannel(
  webViewRef: RefObject<WebView | null>,
  options?: ChannelOptions,
): NativeChannelHandle {
  const { transport, emit } = createNativeTransport(webViewRef);
  const channel = new PlatformChannel(transport, NativeToWeb, WebToNative, options);
  return {
    channel,
    onMessage: (event) => emit(event.nativeEvent.data),
  };
}
