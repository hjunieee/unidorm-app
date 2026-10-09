/**
 * @inu-appcenter/intip-bridge
 *
 * intip-mobile-app(네이티브) ↔ inu-portal-web(웹) 사이 PlatformChannel 브릿지의
 * 공유 단일 소스. 메시지 스키마와 채널 코어를 제공한다.
 *
 * 어댑터는 서브패스로 분리되어 있다(번들 분리 + 플랫폼 의존성 격리):
 *   - 웹:       `@inu-appcenter/intip-bridge/web`
 *   - 네이티브: `@inu-appcenter/intip-bridge/native`
 */
export * from "./messages";
export { PlatformChannel } from "./channel";
export type { Transport, ChannelOptions, RequestOptions } from "./channel";
