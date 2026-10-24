/**
 * @unidorm/bridge
 *
 * unidorm-app(네이티브) ↔ UNIDorm-web(웹) 사이 PlatformChannel 브릿지의
 * 공유 단일 소스. 메시지 스키마와 채널 코어를 제공한다.
 *
 * 어댑터는 서브패스로 분리되어 있다(번들 분리 + 플랫폼 의존성 격리):
 *   - 웹:       `@unidorm/bridge/web`
 *   - 네이티브: `@unidorm/bridge/native`
 */
export * from "./messages";
export { PlatformChannel } from "./channel";
export type { Transport, ChannelOptions, RequestOptions } from "./channel";
