# expo-widgets-glance

**[English](README.md) | [한국어](README.ko.md)**

Android renderer for [`expo-widgets`](https://www.npmjs.com/package/expo-widgets) home screen widgets — runs the **exact same** widget code your project already writes for iOS, and draws it with [Jetpack Glance](https://developer.android.com/jetpack/androidx/releases/glance) instead of SwiftUI.

[![npm version](https://img.shields.io/npm/v/expo-widgets-glance.svg)](https://www.npmjs.com/package/expo-widgets-glance)
[![license](https://img.shields.io/npm/l/expo-widgets-glance.svg)](./LICENSE)

> **🚧 Early and under active development.** Layout stacks, text, shapes, and
> the common modifiers work and are used in real widgets today — but a real
> chunk of `@expo/ui/swift-ui`'s surface has no Android mapping yet (see
> "Coverage" below for the exact list), the build isn't fully automated (a
> manual step before native builds — see "Known limitations"), and it's only
> been run against a handful of real widget designs, not the full space of
> what SwiftUI widgets can express. Anything unmapped renders a visible
> fallback and logs a warning instead of silently breaking, so it's safe to
> try against a real widget and see exactly what's missing for your case.
> Issues and PRs — especially "here's a component/modifier I need" reports —
> are genuinely useful right now.

## Why this exists

`expo-widgets` lets you write a home screen widget as a plain React function using `@expo/ui/swift-ui` components — but as of this writing, that only works on iOS. Its Android side is real plumbing (manifest receivers, an `AppWidgetProvider`, widget-info XML) wrapped around a placeholder that just renders the widget's name as static text. There's no rendering path, and no way to push data to it.

This package is the missing Android half. It doesn't reimplement your widget in Kotlin — it runs the **same JS function** through a small JS engine (QuickJS) and turns the result into real Glance composables. Write one widget, in one place, and it shows up correctly on both platforms.

Curious *how* one widget function can run natively on both iOS and Android with zero platform branching? See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — it traces the exact mechanism through `expo-widgets`' own source, and documents every real rendering bug found (and root-caused) while building this.

## Install

```sh
npx expo install expo-widgets expo-widgets-glance
```

Add both config plugins to `app.json`. `expo-widgets-glance` reads the **same** `widgets[]` array `expo-widgets` does, so a widget's Android footprint stays declared once, not twice:

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
              "displayName": "Today",
              "description": "Shows today's summary.",
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
              "displayName": "Today",
              "description": "Shows today's summary.",
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

Then `npx expo prebuild --clean`.

## Usage

Write your widget exactly as `expo-widgets`' own docs describe, then add one line: `registerGlanceWidget` right next to `createWidget`.

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

registerGlanceWidget('TodayWidget', TodayWidget); // Android — no-op on iOS
export default createWidget('TodayWidget', TodayWidget); // iOS — real widget, from expo-widgets
```

Push data to it the same way, on both platforms:

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

Both are no-ops on iOS, so it's always safe to call them unconditionally.

### Refreshing without the app open

Everything above assumes the app is running when the data changes. Often it isn't: the widget is on the home screen, the app was swiped away days ago, and the data it's showing has gone stale.

iOS answers this by taking a *timeline* — `expo-widgets` hands WidgetKit future-dated entries and it walks them on its own clock, no app process needed. Glance has no equivalent: a widget shows whatever the store last held, and the only way to change that is to write again.

So the Android answer is to fetch when the widget is about to be drawn. Tell the widget how stale its data may get, and register what to do about it:

```ts
// In your app's entry file, at module scope — before anything that can suspend.
import { registerGlanceRefreshTask } from 'expo-widgets-glance';

registerGlanceRefreshTask(async (widgetName) => {
  await refreshTodayWidget(); // ends in updateGlanceSnapshot
});
```

```ts
registerGlanceWidget('TodayWidget', TodayWidget, { refreshIntervalMs: 6 * 60 * 60 * 1000 });
```

When Glance renders a widget whose snapshot is older than `refreshIntervalMs`, it starts your app's JS — booting React Native if the app isn't running — and calls your handler with that widget's name. Nothing waits for the result: the widget draws what it has, and the fresh data lands as a later repaint when your handler calls `updateGlanceSnapshot`. Pushing a snapshot is also what resets the staleness clock, so a handler that fails leaves the widget due for another try rather than marking it done.

Three things worth knowing before reaching for a small interval:

- **It's a floor, not a schedule.** Nothing here causes a widget to be drawn — Android decides that, and its own update floor is 30 minutes. This can only make an update that was going to happen anyway also fetch.
- **Each fetch may cost a cold React Native boot.** That's seconds of CPU in a process the user didn't start. Pick the largest value the data tolerates.
- **Registration has to be a top-level side effect of your entry file.** A headless start evaluates the bundle and immediately looks the task up by name; a registration inside a component has not happened yet at that point, and React Native logs an unknown-task warning instead of running anything.

Omit `refreshIntervalMs` and none of this machinery is touched — the widget simply shows what the app has pushed it, which is the right answer for data that only changes while the user is in the app.

### Widget options

A widget can let the user pick what it shows — a cafeteria, a bus stop — the way an iOS widget does through "Edit Widget". Declare `configuration` on the widget: the same block `expo-widgets` takes, repeated in this plugin's entry.

```json
["expo-widgets-glance", {
  "widgets": [{
    "name": "MenuWidget",
    "displayName": "Menu",
    "description": "Today's menu",
    "configuration": {
      "title": "Menu",
      "parameters": {
        "cafeteria": {
          "title": "Cafeteria",
          "type": "enum",
          "default": "main",
          "values": [{ "name": "Main hall", "value": "main" }, { "name": "Dorm", "value": "dorm" }]
        }
      }
    },
    "android": { "minWidth": 250, "minHeight": 180 }
  }]
}]
```

The layout reads the choice from `environment.configuration`, exactly as on iOS — one line serves both:

```tsx
const cafeteria = environment.configuration?.cafeteria ?? 'main';
```

On Android the widget is placed with its defaults, and the launcher's reconfigure action (long-press the widget) opens a system dialog per parameter: `enum` as a single-choice list, `boolean` as on/off, `string` and `number` as a text field. Choices are stored per widget instance, so two copies of one widget can show different things; they're removed along with the widget. A stored value that no longer matches the declaration — an enum value dropped in an app update, say — falls back to the default instead of reaching the layout.

The app pushing data never learns which option an instance picked, on either platform. Push everything the layout might need and let the layout choose.

### Timelines

When you know in advance how a widget should change — the next class starting, a bus arriving — push a timeline instead of a snapshot, just as you'd call `updateTimeline` on iOS:

```ts
import { updateGlanceTimeline } from 'expo-widgets-glance';

updateGlanceTimeline('BusWidget', [
  { date: now, props: propsAt(now) },
  { date: busSoonAt, props: propsAt(busSoonAt), refresh: true },
  { date: busArrivesAt, props: propsAt(busArrivesAt) },
]);
```

The widget shows the latest entry whose `date` has passed and repaints itself at each later one — no app process needed. An entry with `refresh: true` also starts your refresh task (see above) when it comes due, for data you know runs out at that moment.

Repaints are scheduled with WorkManager, so under Doze they can run late. The render always picks the entry by the clock, so a late repaint still shows the right entry — but a `dateStyle="timer"` countdown keeps ticking between repaints and doesn't stop at zero, so switch it to static text in the entry *before* its deadline rather than relying on the repaint *at* it.

For complete, copy-pasteable widget files — a minimal one-state widget and a more realistic multi-state list with a highlighted row — see [`examples/`](examples/).

## Coverage

**Real Glance rendering:** layout stacks — `VStack`, `HStack`, `ZStack`, `Group`, `LazyVStack`/`LazyHStack` (aliased to `VStack`/`HStack` — a fixed-size widget has no lazy layout to speak of); `Text`, `Spacer`, `Divider`, `Label` (title only), `LabeledContent`, `Link`, `Button` (`label`/`children`, not `systemImage`); shapes — `Rectangle`, `RoundedRectangle`, `Circle`, `Ellipse`, `Capsule`; `Gauge`/`ProgressView` (fall back to a plain percentage label); `Text` with `date`/`dateStyle` — and `dateStyle="timer"` specifically renders a **real ticking countdown** (a RemoteViews `Chronometer` embedded via `AndroidRemoteViews`), which the launcher advances by itself with no app process, matching what WidgetKit does on iOS; `Image` (only via `assetName`, resolved against a drawable of the same name in your app's own `res/drawable` — see below). Modifiers — `padding`, `frame`, `background`, `containerBackground`, `cornerRadius`, `clipShape` (roundedRectangle only), `font`, `foregroundStyle`/`foregroundColor` (plain color only), `border` (approximate — a background box, not a true stroke), `multilineTextAlignment`, `bold`, `italic`, `lineLimit`, `widgetURL`, and `Button`'s `target`-based tap handling.

**Not mapped yet — logged fallback, not a crash:** `Alert`, `BottomSheet`, `ColorPicker`, `ConfirmationDialog`, `ContextMenu`, `ControlGroup`, `DatePicker`, `DisclosureGroup`, `Form`, `List`, `Menu`, `Picker`, `Popover`, `ScrollView`, `SecureField`, `Slider`, `Stepper`, `SwipeActions`, `TabView`, `TextField`, `Toggle`/`SyncToggle`, `ShareLink`, `GlassEffectContainer`, `Section`, `Grid`, `Chart`, `RNHostView`, `Namespace`, `Host`, `Image` via `systemName` or `uiImage`; modifiers — `opacity`, `shadow`, `blur`, `rotationEffect`/`rotation3DEffect`, `scaleEffect`, `glassEffect`, `matchedGeometryEffect`, `monospacedDigit`, `grayscale`, `colorInvert`, `brightness`, `contrast`, `saturation`, `hueRotation`. Most of the components in this list aren't legal inside real WidgetKit content either (no scrolling, no navigation, no most form controls in an actual widget) — the rest is genuinely just not built yet.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#coverage) for the reasoning behind each specific gap, not just the list.

## Known limitations

- A ticking `dateStyle="timer"` never lets the screen go idle, so `uiautomator dump` on a home screen carrying one fails with `ERROR: could not get idle state`. That is inherent to a `Chronometer`, not a bug, but it will break UI-automation scripts that wait for idle — capture a screenshot instead.
- A ticking `dateStyle="timer"` does not stop at zero: past the deadline Android keeps counting and shows a minus sign (`-0:42`), where SwiftUI counts up unsigned. With a timeline, swap the timer for static text in the entry before the deadline (see "Timelines"). Its font *weight* also comes from one of two fixed layouts rather than the node's modifier, because `TextView.setTypeface` is not a `@RemotableViewMethod`; colour and size are applied normally.
- No live measurement, unlike real Compose UI — Glance's RemoteViews translation picks from pre-built layout templates, so a few SwiftUI layout patterns (an element that should "fill exactly as tall as its sibling") don't have a reliable Android equivalent. See `docs/ARCHITECTURE.md` for the specifics and the fallback each one uses.
- `Image` resolves `assetName` to a drawable of the same name in your app's `res/drawable` (`BusIcon` → `bus_icon.xml`), tinted by the `color` prop, so ship it as a monochrome template. `systemName` has nothing to resolve against on Android — there's no equivalent of the SF Symbol catalog — so use `assetName` for anything that has to render on both platforms.
- Interactive `Button`/`Toggle` plumbing exists but hasn't been exercised against a real widget yet.
- Refresh-on-display (`refreshIntervalMs`) has been verified end to end, but only in a dev-client build against Metro: after a device reboot, a widget update cold-started the app process with no activity, booted React Native, and ran the registered task, which fetched. Budget for how long that takes — on a loaded emulator the cold boot took ~9 seconds with the bundle already warm, and a genuinely memory-starved machine stalled it indefinitely. A release build with an embedded bundle should be faster, but hasn't been measured.
- The shared JS runtime bundle currently has to be built by hand (`npm run build:bundle`) before a native build — not yet wired into the config plugin's prebuild hook. The package ships a pre-built copy (`android/src/main/assets/expo_widgets_glance_runtime.js`) as a working fallback, but it's pinned to the `expo-widgets` version it was built against; if your project uses a different one and widgets misbehave, regenerate it with `npm run build:bundle` in your app's root.

None of this is hidden — every gap above is documented in `docs/ARCHITECTURE.md` with the reasoning, not just flagged as a TODO.

## Contributing

Issues and PRs welcome — this is genuinely unfinished (see "Known limitations"), and the architecture doc above should be enough context to pick up any of it. If you add a new `@expo/ui/swift-ui` component or modifier mapping, keep the same honesty convention this package uses throughout: an unmapped case should render a visible fallback and log once, never silently disappear.

Using an AI coding agent (Claude Code, Cursor, ...) to write a widget against this package, or to contribute to it? See [`AGENTS.md`](AGENTS.md) — the hard constraints this widget model imposes (several of them fail silently rather than with a clear error) and the testing gotchas found while building this, condensed into something an agent can follow directly.

## License

MIT — see [LICENSE](LICENSE). Two files are adapted from `expo-widgets` (MIT, © 650 Industries, Inc.) — see [NOTICE.md](NOTICE.md).
