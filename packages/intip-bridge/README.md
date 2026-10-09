# @inu-appcenter/intip-bridge

`intip-mobile-app`(네이티브, Expo) ↔ `inu-portal-web`(웹, Vite) 사이의 WebView 브릿지를
**Zod 스키마로 엄격하게 타입화한 단일 소스 패키지**. 양쪽 레포가 이 패키지를 공유 import 하여
동일한 메시지 스키마로 직렬화/검증한다.

- **단일 소스 스키마** — 모든 메시지가 `messages.ts`의 Zod discriminated union으로 정의됨.
  `event`별 `value` 타입이 컴파일 타임에 강제되고, 런타임에는 경계에서 검증됨.
- **PlatformChannel** — `postMessage`/`onMessage` 등 운반 수단을 추상화. 앱은
  `channel.send(event, value)` / `channel.on(event, handler)`만 다룬다.
- **양방향 대칭** — Web→Native, Native→Web 모두 같은 `{ event, value, v, id }` 봉투를 사용.

## 설치 (GitHub Packages)

> **NOTE**: 아래 GitHub Packages 설치 안내는 더 이상 실제 소비 방식이 아니다.
> `intip-mobile-app`과 `inu-portal-web` 둘 다 이 레포를 `packages/intip-bridge`
> git submodule로 vendoring해 **소스에서 직접 컴파일**한다(상대 경로 import,
> npm 패키지 아님). 계약을 바꿀 때는 npm publish/버전업 없이, 이 레포에서
> commit+push 한 뒤 두 소비 레포에서 `git submodule update --remote
> packages/intip-bridge` 로 SHA pin만 올린다. 아래 절차는 과거 배포 방식의
> 기록으로 남겨둔다.

소비 레포의 루트에 `.npmrc` 추가:

```
@inu-appcenter:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

그 다음:

```sh
npm install @inu-appcenter/intip-bridge
```

> `GITHUB_TOKEN`은 `read:packages` 권한이 있는 PAT. CI는 `secrets.GITHUB_TOKEN` 사용.

## 사용

### 웹 (inu-portal-web)

```ts
import { createWebChannel } from "@inu-appcenter/intip-bridge/web";

const channel = createWebChannel(); // ReactNativeWebView 없으면(브라우저/구앱) null
if (channel) {
  channel.send("navigateTo", { path: "/board/12", url: location.origin + "/board/12" });
  channel.on("receiveFcmToken", (token) => syncFcmToken(token));
  channel.on("navigate", (path) => router.navigate(path));
}
```

### 네이티브 (intip-mobile-app)

```ts
import { createNativeChannel } from "@inu-appcenter/intip-bridge/native";

const { channel, onMessage } = createNativeChannel(webViewRef);
channel.on("navigateTo", ({ path, url }) => pushWebView(url));
channel.on("goBack", () => popWebView());
channel.send("receiveFcmToken", token);

// <WebView ref={webViewRef} onMessage={onMessage} />
```

> `/native` 엔트리는 `react-native-webview`(>=13)를 타입으로만 사용한다. 의도적으로
> `peerDependencies`에 넣지 않았는데, GitHub Packages 레지스트리가 `peerDependenciesMeta`
> (optional 플래그)를 메타데이터에서 누락시켜 웹 소비자 설치 시 react-native까지
> 끌려오기 때문. 네이티브 앱은 `react-native-webview`를 직접 dependency로 설치할 것.

## 공유 시트 / 기능 광고

- `share` (web → native, request/reply) — OS 공유 시트(iOS `UIActivityViewController`,
  Android `Intent.ACTION_SEND`)를 연다. `SharePayload`는 Web Share API의
  `ShareData`와 필드명을 맞췄다(`title`/`text`/`url`, 파일 공유는 v1 미지원
  확장 슬롯 `files`). 네이티브는 같은 `id`로 `shareResult`를 돌려보낸다.
  사용자가 시트를 닫을 때까지 걸릴 수 있어 기본 `request()` 타임아웃(10s)이
  아니라 `channel.requestWithOptions("share", { timeoutMs: … }, payload)`로
  이 호출에 한해 타임아웃을 늘려 호출해야 한다.

  ```ts
  const result = await channel.requestWithOptions(
    "share",
    { timeoutMs: 5 * 60_000 },
    { url: location.href, title: "게시글 공유" },
  );
  // result.value.status: "shared" | "dismissed" | "unsupported" | "error"
  ```

- `shareResult` (native → web) — `share` 요청에 대한 응답. `status`가
  `"unsupported"`면 해당 네이티브 버전이 아직 공유 시트를 구현하지 않은
  것이다(웹은 브라우저 `navigator.share` 등으로 폴백할 수 있다).
- `bridgeCapabilities` (native → web) — 네이티브가 `bridgeReady` 수신 직후
  먼저 보내는(웹의 요청 없이) 기능 광고. `protocol`은 네이티브가 구현한
  `PROTOCOL_VERSION`, `features`는 지원하는 이벤트 이름 등의 자유 문자열
  목록이다. 웹은 이 값으로 `share` 같은 선택적 기능의 가용 여부를 요청 전에
  미리 판단할 수 있다.

## 새 메시지 추가

1. `src/messages.ts`의 `WebToNative` 또는 `NativeToWeb` union에 `def("event", payloadSchema)` 추가.
2. 버전 올려 publish → 양쪽 레포에서 업데이트.

타입과 검증이 자동으로 따라오므로 양쪽이 동기화된다.

## 개발

```sh
npm install --legacy-peer-deps   # react-native-webview가 RN peer를 끌어옴
npm run typecheck
npm test
npm run build
```

## 배포

`vX.Y.Z` 태그 push → `.github/workflows/publish.yml`가 GitHub Packages로 publish.

```sh
npm version patch && git push --follow-tags
```
