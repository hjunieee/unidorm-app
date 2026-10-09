# expo-widgets-glance

**[English](README.md) | [한국어](README.ko.md)**

[`expo-widgets`](https://www.npmjs.com/package/expo-widgets) 홈 화면 위젯을 위한 Android 렌더러입니다. iOS용으로 이미 작성한 위젯 코드를 **그대로** 실행하되, SwiftUI 대신 [Jetpack Glance](https://developer.android.com/jetpack/androidx/releases/glance)로 그려줍니다.

[![npm version](https://img.shields.io/npm/v/expo-widgets-glance.svg)](https://www.npmjs.com/package/expo-widgets-glance)
[![license](https://img.shields.io/npm/l/expo-widgets-glance.svg)](./LICENSE)

> **🚧 아직 초기 단계이며 활발히 개발 중입니다.** 레이아웃 스택, 텍스트, 도형,
> 자주 쓰는 모디파이어는 실제로 동작하고 지금도 실제 위젯에서 쓰이고 있지만,
> `@expo/ui/swift-ui`의 상당 부분은 아직 Android 매핑이 없습니다 (정확한
> 목록은 아래 "지원 범위" 참고). 빌드 과정도 아직 완전히 자동화되어 있지
> 않고(네이티브 빌드 전 수동 단계 하나가 필요 — "알려진 한계" 참고),
> 실제로 검증된 것은 몇몇 위젯 디자인뿐이며 SwiftUI 위젯이 표현할 수 있는
> 전체 범위를 다 다루지는 못했습니다. 매핑되지 않은 항목은 조용히 깨지는
> 대신 눈에 보이는 폴백을 렌더링하고 경고 로그를 남기므로, 실제 위젯에
> 시도해보고 여러분의 사례에서 정확히 무엇이 빠져있는지 바로 확인할 수
> 있습니다. 이슈와 PR — 특히 "이런 컴포넌트/모디파이어가 필요하다"는
> 제보 — 지금 시점에 정말 도움이 됩니다.

## 왜 필요한가

`expo-widgets`는 `@expo/ui/swift-ui` 컴포넌트를 사용한 평범한 React 함수만으로 홈 화면 위젯을 작성할 수 있게 해줍니다 — 하지만 이 글을 쓰는 시점 기준으로 iOS에서만 동작합니다. Android 쪽은 매니페스트 리시버, `AppWidgetProvider`, 위젯 정보 XML 등 실제 배관은 갖춰져 있지만, 그 안은 위젯 이름을 그냥 고정된 텍스트로 렌더링하는 자리표시자 하나뿐입니다. 실제 렌더링 경로도, 데이터를 밀어넣을 방법도 없습니다.

이 패키지는 그 빠진 Android 절반입니다. 위젯을 Kotlin으로 다시 구현하는 대신, **같은 JS 함수**를 작은 JS 엔진(QuickJS)으로 실행하고 그 결과를 실제 Glance 컴포저블로 변환합니다. 위젯을 한 곳에, 한 번만 작성하면 두 플랫폼 모두에서 올바르게 나타납니다.

하나의 위젯 함수가 어떻게 플랫폼 분기 없이 iOS와 Android 양쪽에서 네이티브로 동작하는지 궁금하다면 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)를 확인하세요 — `expo-widgets` 자체 소스를 추적해 정확한 동작 원리를 설명하고, 이 패키지를 만들며 발견한(그리고 원인을 규명한) 모든 실제 렌더링 버그를 기록해두었습니다. (영어로 작성되어 있습니다.)

## 설치

```sh
npx expo install expo-widgets expo-widgets-glance
```

`app.json`에 두 config plugin을 모두 추가하세요. `expo-widgets-glance`는 `expo-widgets`와 **같은** `widgets[]` 배열을 읽기 때문에, 위젯 하나를 두 번이 아니라 한 번만 선언하면 됩니다:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-widgets",
        {
          "widgets": [
            {
              "name": "TodayWidget",
              "displayName": "오늘",
              "description": "오늘의 요약 정보를 보여줍니다.",
              "ios": { "supportedFamilies": ["systemSmall"] }
            }
          ]
        }
      ],
      [
        "expo-widgets-glance",
        {
          "widgets": [
            {
              "name": "TodayWidget",
              "displayName": "오늘",
              "description": "오늘의 요약 정보를 보여줍니다.",
              "android": {
                "minWidth": 110,
                "minHeight": 110,
                "targetCellWidth": 2,
                "targetCellHeight": 2,
                "resizeMode": "none"
              }
            }
          ]
        }
      ]
    ]
  }
}
```

이후 `npx expo prebuild --clean`을 실행하세요.

## 사용법

`expo-widgets` 공식 문서에 나온 방식 그대로 위젯을 작성한 뒤, `createWidget` 바로 옆에 한 줄 — `registerGlanceWidget` — 만 추가하면 됩니다.

```tsx
import { Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import { registerGlanceWidget } from 'expo-widgets-glance';

const TodayWidget = (props: { title: string }) => {
  'widget';
  return (
    <VStack modifiers={[padding({ all: 16 }), containerBackground('#FFFFFF', 'widget')]}>
      <Text modifiers={[font({ size: 20, weight: 'semibold' })]}>{props.title}</Text>
    </VStack>
  );
};

registerGlanceWidget('TodayWidget', TodayWidget); // Android — iOS에서는 아무 동작 없음
export default createWidget('TodayWidget', TodayWidget); // iOS — expo-widgets가 제공하는 실제 위젯
```

데이터를 밀어넣는 방식도 두 플랫폼에서 동일합니다:

```ts
import { Platform } from 'react-native';
import { updateGlanceSnapshot } from 'expo-widgets-glance';
import TodayWidget from './TodayWidget';

export function refreshTodayWidget(title: string) {
  if (Platform.OS === 'ios') {
    TodayWidget.updateSnapshot({ title });
  } else if (Platform.OS === 'android') {
    updateGlanceSnapshot('TodayWidget', { title });
  }
}
```

API 전체가 이게 다입니다: `registerGlanceWidget(name, layout)`와 `updateGlanceSnapshot(name, props)`. 둘 다 iOS에서는 아무 동작도 하지 않으므로, 플랫폼 분기 없이 항상 호출해도 안전합니다.

### 위젯 옵션

iOS 위젯의 "위젯 편집"처럼, 위젯이 무엇을 보여줄지 사용자가 고르게 할 수 있습니다(식당, 버스 정류장 등). 위젯에 `configuration`을 선언하세요 — `expo-widgets`가 받는 것과 같은 블록을 이 플러그인 항목에도 똑같이 적습니다.

```json
["expo-widgets-glance", {
  "widgets": [{
    "name": "MenuWidget",
    "displayName": "메뉴",
    "description": "오늘의 메뉴",
    "configuration": {
      "title": "메뉴",
      "parameters": {
        "cafeteria": {
          "title": "식당",
          "type": "enum",
          "default": "main",
          "values": [{ "name": "학생식당", "value": "main" }, { "name": "기숙사식당", "value": "dorm" }]
        }
      }
    },
    "android": { "minWidth": 250, "minHeight": 180 }
  }]
}]
```

레이아웃은 iOS와 똑같이 `environment.configuration`에서 선택값을 읽습니다 — 한 줄로 두 플랫폼을 모두 처리합니다:

```tsx
const cafeteria = environment.configuration?.cafeteria ?? 'main';
```

Android에서는 위젯이 기본값으로 배치되고, 런처의 위젯 설정 동작(위젯 길게 누르기)이 파라미터마다 시스템 대화상자를 엽니다. `enum`은 단일 선택 목록, `boolean`은 켜기/끄기, `string`과 `number`는 텍스트 입력입니다. 선택값은 위젯 인스턴스마다 따로 저장되므로 같은 위젯 두 개가 서로 다른 내용을 보여줄 수 있고, 위젯을 지우면 함께 지워집니다. 저장된 값이 선언과 더 이상 맞지 않으면(앱 업데이트로 enum 값이 빠진 경우 등) 레이아웃에 넘기지 않고 기본값을 씁니다.

데이터를 밀어넣는 앱은 어느 플랫폼에서든 인스턴스가 무엇을 골랐는지 알 수 없습니다. 레이아웃이 필요로 할 수 있는 데이터를 모두 넣고, 선택은 레이아웃에 맡기세요.

### 타임라인

위젯이 언제 어떻게 바뀌어야 하는지 미리 알 때(다음 수업 시작, 버스 도착 등)는 스냅샷 대신 타임라인을 밀어넣으세요. iOS에서 `updateTimeline`을 호출하는 것과 같습니다:

```ts
import { updateGlanceTimeline } from 'expo-widgets-glance';

updateGlanceTimeline('BusWidget', [
  { date: now, props: propsAt(now) },
  { date: busSoonAt, props: propsAt(busSoonAt), refresh: true },
  { date: busArrivesAt, props: propsAt(busArrivesAt) },
]);
```

위젯은 `date`가 지난 항목 중 가장 최근 것을 보여주고, 이후 항목의 시각마다 앱 프로세스 없이 스스로 다시 그립니다. `refresh: true`인 항목은 그 시각에 새로고침 작업(위 참고)도 시작합니다 — 그 순간 데이터가 소진된다는 걸 알 때 쓰세요.

다시 그리기는 WorkManager로 예약되므로 Doze 상태에서는 늦게 실행될 수 있습니다. 렌더링은 항상 시계로 항목을 고르므로 늦어도 올바른 항목이 보이지만, `dateStyle="timer"` 카운트다운은 다시 그리기 사이에도 계속 흘러가고 0에서 멈추지 않습니다. 마감 시각의 다시 그리기에 기대지 말고, 마감 *전* 항목에서 고정 텍스트로 바꾸세요.

바로 복사해서 쓸 수 있는 완전한 위젯 파일 — 단일 상태의 최소 위젯과, 강조 표시된 행이 있는 좀 더 현실적인 다중 상태 리스트 위젯 — 은 [`examples/`](examples/)에 있습니다.

## 지원 범위 (Coverage)

**실제로 Glance로 렌더링되는 것:** 레이아웃 스택 — `VStack`, `HStack`, `ZStack`, `Group`, `LazyVStack`/`LazyHStack`(`VStack`/`HStack`에 별칭 처리 — 크기가 고정된 위젯에는 지연 로딩 레이아웃이라는 개념이 없습니다); `Text`, `Spacer`, `Divider`, `Label`(제목만), `LabeledContent`, `Link`, `Button`(`label`/`children`만, `systemImage`는 아님); 도형 — `Rectangle`, `RoundedRectangle`, `Circle`, `Ellipse`, `Capsule`; `Gauge`/`ProgressView`(단순 퍼센트 텍스트로 폴백); `Image`(`assetName`으로만 — 앱 자신의 `res/drawable`에 있는 같은 이름의 드로어블로 해석됩니다, 아래 참고). 모디파이어 — `padding`, `frame`, `background`, `containerBackground`, `cornerRadius`, `clipShape`(roundedRectangle만), `font`, `foregroundStyle`/`foregroundColor`(단색만), `border`(근사치 — 실제 스트로크가 아니라 배경 박스), `multilineTextAlignment`, `bold`, `italic`, `lineLimit`, `widgetURL`, 그리고 `Button`의 `target` 기반 탭 처리.

**아직 매핑되지 않음 — 로그와 함께 폴백, 크래시는 아님:** `Alert`, `BottomSheet`, `ColorPicker`, `ConfirmationDialog`, `ContextMenu`, `ControlGroup`, `DatePicker`, `DisclosureGroup`, `Form`, `List`, `Menu`, `Picker`, `Popover`, `ScrollView`, `SecureField`, `Slider`, `Stepper`, `SwipeActions`, `TabView`, `TextField`, `Toggle`/`SyncToggle`, `ShareLink`, `GlassEffectContainer`, `Section`, `Grid`, `Chart`, `RNHostView`, `Namespace`, `Host`, `systemName`이나 `uiImage`를 쓰는 `Image`; 모디파이어 — `opacity`, `shadow`, `blur`, `rotationEffect`/`rotation3DEffect`, `scaleEffect`, `glassEffect`, `matchedGeometryEffect`, `monospacedDigit`, `grayscale`, `colorInvert`, `brightness`, `contrast`, `saturation`, `hueRotation`. 이 목록의 컴포넌트 대부분은 애초에 실제 WidgetKit 콘텐츠 안에서도 허용되지 않습니다(스크롤 없음, 내비게이션 없음, 대부분의 입력 컨트롤 없음) — 나머지는 정말로 아직 구현되지 않은 것입니다.

각 공백의 구체적인 이유는 목록만이 아니라 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#coverage)에서 확인할 수 있습니다.

## 알려진 한계

- 실제 Compose UI와 달리 실시간 측정(live measurement)이 없습니다 — Glance의 RemoteViews 변환은 미리 만들어진 레이아웃 템플릿 중에서 골라 쓰는 방식이라, 일부 SwiftUI 레이아웃 패턴("형제 요소와 정확히 같은 높이로 채우기" 같은)은 Android에서 신뢰할 만한 대응 방법이 없습니다. 구체적인 내용과 각각의 대체 방법은 `docs/ARCHITECTURE.md`에 있습니다.
- `Image`는 `assetName`을 앱의 `res/drawable`에 있는 같은 이름의 드로어블로 해석합니다(`BusIcon` → `bus_icon.xml`). `color` prop으로 틴트되므로 단색 템플릿으로 넣으세요. `systemName`은 Android에 해석할 대상이 없으므로(SF Symbol 카탈로그에 대응하는 것이 없습니다) 양쪽 플랫폼에서 렌더링돼야 하는 아이콘은 `assetName`을 쓰세요.
- 인터랙티브 `Button`/`Toggle` 배관은 존재하지만 아직 실제 위젯에서 검증된 적은 없습니다.
- 공유 JS 런타임 번들은 현재 네이티브 빌드 전에 수동으로 빌드해야 합니다(`npm run build:bundle`) — 아직 config plugin의 prebuild 훅에 연결되어 있지 않습니다. 패키지에는 미리 빌드된 번들(`android/src/main/assets/expo_widgets_glance_runtime.js`)이 폴백으로 포함되어 있지만, 빌드 당시의 `expo-widgets` 버전에 고정되어 있습니다. 다른 버전을 사용 중이고 위젯이 이상하게 동작한다면 앱 루트에서 `npm run build:bundle`로 다시 생성하세요.

위 내용 중 숨겨진 것은 없습니다 — 모든 공백은 단순 TODO가 아니라 이유와 함께 `docs/ARCHITECTURE.md`에 문서화되어 있습니다.

## 기여하기

이슈와 PR을 환영합니다 — 이 프로젝트는 정말로 미완성 상태이고("알려진 한계" 참고), 위의 아키텍처 문서만으로도 어느 부분이든 이어받아 작업하기에 충분한 맥락이 될 것입니다. 새로운 `@expo/ui/swift-ui` 컴포넌트나 모디파이어 매핑을 추가한다면, 이 패키지 전체에 일관되게 적용된 원칙을 유지해주세요: 매핑되지 않은 경우는 눈에 보이는 폴백을 렌더링하고 한 번만 로그를 남겨야지, 조용히 사라지면 안 됩니다.

AI 코딩 에이전트(Claude Code, Cursor 등)로 이 패키지를 사용하는 위젯을 작성하거나, 이 패키지 자체에 기여하려 하시나요? [`AGENTS.md`](AGENTS.md)를 확인하세요 — 이 위젯 모델이 강제하는 제약 사항들(그중 여러 개는 명확한 에러 없이 조용히 실패합니다)과, 이 패키지를 만들며 발견한 테스트 관련 함정들을 에이전트가 바로 따라 할 수 있는 형태로 정리해두었습니다. (영어로 작성되어 있습니다.)

## 라이선스

MIT — [LICENSE](LICENSE) 참고. 파일 두 개는 `expo-widgets`(MIT, © 650 Industries, Inc.)에서 가져와 수정한 것입니다 — [NOTICE.md](NOTICE.md) 참고.
