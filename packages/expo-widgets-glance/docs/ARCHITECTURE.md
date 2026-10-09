# Architecture & lessons learned

> Looking for install/usage instructions? See the [main README](../README.md).
> This document is the deep technical record: the exact wire mechanism this
> package reverse-engineers, every real bug found while building it and how
> each was root-caused, and what's still unfinished. Written as it happened,
> not cleaned up into a tidy design doc — the debugging methodology is
> deliberately kept, not just the conclusions.

**Status: both designed widgets, working, on a real emulator.**
`NextClassWidget` (small) and `TodayClassesWidget` (medium) are both on a home
screen on a Pixel-class API 36 emulator right now, rendered by this code, and
both look like their designs — date label, tinted/highlighted schedule row
with the brand-blue accent bar, class name and room, all produced by
`WidgetJsHost` running the actual widget source through QuickJs and
`GlanceTreeRenderer` turning the result into Glance composables. This is
installed via `expo-modules-autolinking`
(`"expo-widgets-glance": "file:packages/expo-widgets-glance"` in
`intip-mobile-app`'s `package.json`) and the config plugin wired into that
app's `app.json`, exactly as a real consumer would use it — not a bespoke
test harness.

Getting both widgets fully correct (not just "renders without throwing")
surfaced several more real bugs, on top of the compile-time ones below — this
time in the render pipeline itself, not the build:

- **`SizeMode.Single` was silently clipping content.** Its own doc comment
  says why: `LocalSize` under `Single` (Glance's default, which
  `ExpoWidgetsGlanceWidget` used) "will be the *minimum* size the App Widget
  can be, as defined in the App Widget provider info" — composed against the
  static `minWidth`/`minHeight` declared in the generated widget-info XML,
  not the size the widget is actually placed at. Confirmed by watching row
  count track `minHeight` directly (1 row at 110dp, 2 at 200dp) while the
  host view was visibly much taller than either value. `SizeMode.Exact` was
  tried next and reverted — it composes concurrently for every size
  `AppWidgetManager.getAppWidgetOptions` reports (one of which was an oddly
  wide 774dp option on the tested device), and something in how the
  framework picks which composition to display left large, size-proportional
  gaps between rows that had no counterpart in the actual composed tree.
  Landed on `SizeMode.Responsive(setOf(designSize))` — one fixed size,
  matching how these widgets are actually designed (fixed Figma frames, not
  arbitrary-size-adaptive) — which removes the multi-composition ambiguity
  outright rather than fighting it.
- **A Composition-lifetime `remember` doesn't mean "cache for one render."**
  `propsJson`/`layoutSource` were read inside a bare, unkeyed `remember {}`.
  Glance's `AppWidgetSession` reuses one `Composition` across every
  `provideGlance`/`updateAll` call for as long as a widget instance stays on
  the home screen, rather than starting fresh each time — so a bare
  `remember` computed on the very first composition silently never re-read
  the store again, no matter how many new snapshots or layout fixes were
  pushed afterward. This is *why* several fixes below appeared to do nothing
  until the widget was removed and re-added (which tears down the
  Composition): they were rendering correctly the whole time, just always
  the pre-fix version. Fixed by not wrapping those two reads in `remember`
  at all (they're cheap; re-read every recomposition) and adding
  `layoutSource` to the `tree` computation's `remember` key, which had also
  been missing it.
- **A Row/Column child's own `frame({maxWidth`/`maxHeight: Infinity})` — main-axis
  fill — silently drops every sibling after it.** This is a real Android
  `LinearLayout` behavior, not a Glance bug exactly: a horizontal
  `LinearLayout` child set to `match_parent` width claims the *entire* row,
  not "the rest of it" — SwiftUI's `frame(maxWidth: .infinity)` has no such
  restriction, so nothing about the source design suggested this would be a
  problem. Confirmed by hardcoding a bare `Row { Row(fillMaxWidth) { ... };
  Text("room") }` directly in Kotlin: `"room"` never rendered, and the
  parent row's own height inflated unpredictably (almost certainly text
  measurement against a squeezed-to-zero remaining width) — removing just
  the inner `fillMaxWidth()` fixed both symptoms immediately, isolating the
  cause precisely. `RowScope`/`ColumnScope`'s `defaultWeight()` (real flex,
  not fill) is what Glance actually wants here. `RenderNodeView` now detects
  a child wanting *main-axis* fill (`maxWidth` inside a Row, `maxHeight`
  inside a Column) from inside the parent's own Row/Column scope and applies
  `defaultWeight()` to it there instead of letting the plain `fillMaxWidth()`/
  `fillMaxHeight()` baked in by `ModifierRegistry` apply on its own — cross-axis
  fill (`maxHeight` in a Row, `maxWidth` in a Column) doesn't have this
  problem and is untouched.
- **A Column/Row's `spacing` silently does nothing across a `react.fragment`
  child.** A `<>...</>` (JSX fragment shorthand) is one opaque [RenderNode]
  entry in `node.children` at the data level — it only expands into its own
  children at render time (see the `"react.fragment"` case) — but nearly
  every widget's root `content` variable *is* one, wrapping the actual
  siblings a stack's `spacing` is meant to separate. Gap-insertion indexed
  over the un-flattened list saw exactly one child (the fragment) and had
  nothing to insert `spacing` between: `TodayClassesWidget`'s root
  `spacing={12}` never produced any visible gap between its header and its
  (fragment-wrapped) schedule list. Fixed with `flattenFragments()`,
  expanding fragment entries recursively before the Column/Row branches do
  their gap-insertion pass.
- **A plain `background()` with no `cornerRadius` isn't square by default —
  it's whatever the current system theme's default is.** Neither Glance's
  own `background()` (checked directly against its source: plain color, no
  shape/corner concept at all) nor `ModifierRegistry`'s handling of it was
  requesting any rounding, and the persisted layout source had no
  `cornerRadius`/`roundedRectangle` anywhere — confirmed both ways before
  looking anywhere else — yet `TodayClassesWidget`'s highlighted row still
  rendered with a visibly rounded right edge on the tested device (API 36).
  Whatever RemoteViews' translation of a plain color background does under
  the hood, it's picking up a rounded drawable from the current (likely
  Material You) system theme when no radius is specified, not defaulting to
  a plain rectangle. There's no Glance-level way to ask for "whatever the
  system default is" instead — the fix is applying `cornerRadius(0.dp)`
  *unconditionally* (not only when a radius is explicitly requested) so a
  design that genuinely wants square corners can actually get them.
- **A literal backslash-n breaks anywhere in a widget function's source, not
  just inside string literals.** `NextClassWidget.tsx` had multi-line
  headings written as `heading('오늘은` + a newline-escape + `공강이에요')`
  (see the file itself, not spelled out here — see why below). Some step in
  the Metro/Hermes pipeline that this project's `Function.toString()`
  depends on (see "The exact wire mechanism" above) corrupts that exact
  two-character sequence into a real newline byte — confirmed by pulling the
  actual persisted layout source off the device and feeding it to
  `node --check`, which pointed at a string literal split in half. The fix
  (separate `Text` lines instead of an embedded escape) is documented at the
  call site in `NextClassWidget.tsx`, deliberately without literally writing
  out the trigger sequence in that comment — an earlier attempt at this exact
  comment wrote the sequence out to explain the bug, and by doing so
  reintroduced it (this time splitting the *comment* into a live code
  fragment), caught by the same node --check technique. If you need to
  reference this in a comment inside a widget function, spell it out in
  words, the way this README does.

Not everything is verified yet: only each widget's one sample state has been
looked at on-screen (`NextClassWidget`'s `upcoming` and `TodayClassesWidget`'s
`normal`); interactive Button/Toggle remain unexercised; nothing has been
tried on a physical device, only the emulator.

Getting to a clean compile surfaced several real bugs, all fixed, kept here as a record of
what "confirmed against source" and even "compiles" were each still hiding:
- Missing `buildscript {}` block for the Compose Kotlin plugin's classpath —
  copied from `expo-widgets`' own `build.gradle` in every other file, just
  plain omitted from this package's own.
- `app.cash.zipline:zipline:1.27.0` (latest at the time) is built with Kotlin
  2.3.20; this app's own `kotlinVersion` is 2.1.0 — "Module was compiled with
  an incompatible version of Kotlin." Pinned to `1.19.0`, the release built
  against Kotlin 2.1.0 (see the version comment in `android/build.gradle`).
- `AsyncFunction`'s block isn't itself a suspend lambda in this
  expo-modules-core version — calling `WidgetsGlanceStore`'s suspend
  DataStore functions directly from it failed to compile. Wrapped in
  `runBlocking` (safe here: `AsyncFunction` already runs off the main
  thread).
- `androidx.compose.ui.Alignment` (Compose UI's) isn't what
  Glance's `Column`/`Row` take — they want `androidx.glance.layout.Alignment`,
  a different, Glance-owned type with the same nested-value-class shape.
- `androidx.glance.action.actionStartActivity` only has `ComponentName`/
  `Activity`-class overloads (launch-my-own-activity). The `Intent`-taking
  overload — the one `widgetURL` actually needs — lives in
  `androidx.glance.appwidget.action` instead, explicitly documented there as
  "supported by app widgets only."
- `expo-widgets-glance`'s own `package.json` pointed `main` at a `build/index.js`
  that was never built (only `plugin/` had a build step) — Metro's resolver
  failure crashed the *app*, immediately, on the very first import of
  `refresh.ts`. Fixed by pointing `main` straight at `index.ts` (Metro
  transforms it like any other local TypeScript, no separate build needed for
  this to work inside the monorepo).
- `TodayClassesWidget.tsx` declared `const MAX_ROWS = 3` at module scope, then
  referenced it from inside the widget function — exactly the trap that
  function's own doc comment (and `TestWidget.tsx`'s, and this README's
  wire-mechanism section) warns about: only the function's own source text
  ships to the widget process, so `MAX_ROWS` resolved to nothing there
  (`QuickJsException: 'MAX_ROWS' is not defined`, caught via logcat against
  the real device). Fixed by moving the `const` inside the function body.
- React's `<>...</>` fragment shorthand, used inside every widget's `content`
  assembly, produces a node with `type: 'react.fragment'` (confirmed:
  `react-stub.ts`'s `Fragment` export is literally that string) —
  `GlanceTreeRenderer` had no case for it and fell through to the
  "Unsupported" fallback, so the widget rendered a white card with nothing on
  it instead of a render error. Fixed by treating it as a transparent
  passthrough that just renders its children into whatever Column/Row/Box
  scope the parent already opened.

None of this changes anything in "Coverage" below — same components, same
modifiers, same fallbacks. It's the same design, now proven against a real
render instead of against my reading of library source.

## What this is

`expo-widgets` (the official Expo package) renders home screen widgets from a
`'widget'`-tagged React function using `@expo/ui/swift-ui` components — but
only on iOS. Its own Android code, as of `expo-widgets@56.0.26`, is real
plumbing (manifest receivers, an `AppWidgetProvider` subclass, widget-info
XML) wrapped around a placeholder: `ExpoWidgetsGlanceWidget.kt` just renders
`Text(widgetName)`, and `WidgetsModule.kt`'s native module has no functions at
all — Android quietly no-ops instead of crashing (see "How Android currently
behaves" below), but there's no rendering path and no way to push data to it.

This package is the missing Android half: it runs the **same** widget JS a
project already writes for iOS and renders it with Jetpack Glance instead of
SwiftUI.

## Why this is possible at all

It would not be if `expo-widgets` widgets were "real" SwiftUI under the hood —
SwiftUI's `View` protocol has no Android equivalent. But they aren't. Look at
`node_modules/expo-widgets/bundle/expo-stub.ts`, which Metro substitutes for
the real `expo` package when building the widget JS bundle
(`node_modules/expo-widgets/bundle/metro.config.js`):

```ts
export function requireNativeView(moduleName: string, viewName: string) {
  return (props) => ({ type: viewName, props: props || {} });
}
```

Every `@expo/ui/swift-ui` component (`VStack`, `Text`, ...) is
`requireNativeView(...)` under the hood, so inside the widget bundle they
don't produce live SwiftUI views — they produce a **plain, JSON-serializable
object tree**. `WidgetsJSRuntime.swift` runs that bundle in a bare
`JSContext` (JavaScriptCore — no Fabric, no JSI object graph), calls
`__expoWidgetRender(props, environment)`, and gets back exactly that
dictionary. Only *then* does Swift code (`Widgets/DynamicView.swift` and
friends) walk it and build real `SwiftUI.View`s.

## The exact wire mechanism (traced through expo-widgets' own source)

Two separate things get shipped to the widget extension, and it's worth
being precise about which is which:

1. **The shared runtime**, built once from `expo-widgets`' own
   `bundle/index.ts` (`expo export:embed`, Metro config swaps out
   `expo`/`expo-modules-core`/`react`/`react-native` for stubs). Evaluating
   it defines `VStack`/`HStack`/`Text`/every modifier/`__expoWidgetRender`/
   `__expoWidgetHandlePress` as globals in a fresh JS context. Nothing in it
   references any particular widget.
2. **Each widget's layout** — not a separate bundle per widget, as I first
   assumed, but literally the widget function's **own source text**. Tracing
   the call chain end to end:
   - `Widgets.js`: `createWidget(name, widget)` → `new Widget(name, widget)`
     → `new ExpoWidgetsModule.Widget(name, widget)` (`widget` is the actual
     JS function value, passed straight through).
   - `WidgetsModule.swift`: `Constructor { (name: String, layout: String) in
     WidgetObject(name: name, layout: layout) }` — the constructor's declared
     parameter type is `String`. expo-modules-core's argument coercion is
     what turns the JS function value into its source text here (i.e. the
     equivalent of calling `.toString()` on it) — there's no other way the
     types line up.
   - `WidgetObject.swift`: persists exactly that string —
     `WidgetsStorage.set(layout, forKey: "__expo_widgets_${name}_layout")` —
     once, the first time, in a location shared between the app and the
     widget extension.
   - `Widgets/EntryView.swift`: reads it back by the same key and calls
     `evaluateLayout(layout:props:environment:)`.
   - `WidgetsJSRuntime.swift`: evaluates that raw source text as a bare
     expression inside the *already-loaded* shared-runtime context —
     `context.setObject(layoutValue, forKeyedSubscript: "__expoWidgetLayout")`
     — then calls `__expoWidgetRender`, which reads
     `globalThis.__expoWidgetLayout(props, environment)`.

   This is also exactly why `TestWidget.tsx`'s doc comment says "module-scope
   values from this file are NOT in scope inside the function" — only the
   function's own source text survives, evaluated with nothing but
   `globalThis` (populated by the shared runtime) in scope. Every color/style
   constant this app's widget files use is declared *inside* the widget
   function body for exactly this reason.

So the pipeline, end to end:

```
shared runtime bundle (built once)  →  defines VStack/Text/.../__expoWidgetRender as globals
widget function's own .toString()   →  persisted once, evaluated fresh as `__expoWidgetLayout`
__expoWidgetRender(props, environment)  →  plain { type, props: { modifiers: [{$type,...}], children } } tree
platform-specific interpreter  →  builds real UI from that tree
```

Nothing above is Apple-specific until the very last step. This package
supplies an Android version of the runtime bundle (same source, rebuilt with
`--platform android` — see `scripts/build-android-bundle.mjs`), its own way
of capturing a widget's layout source text (see "Why not extend
`expo-widgets`' own `createWidget`?" below), and a Kotlin interpreter
targeting Glance instead of SwiftUI.

## How Android currently behaves without this package

Worth stating plainly, since it's easy to assume the opposite from the
Kotlin-side plumbing alone: `expo-widgets` does **not** crash on Android.
`build/ExpoWidgets.ios.js` is the real native-backed module; on every other
platform Metro resolves the platform-less `build/ExpoWidgets.js`, which is a
deliberate no-op stub (`WidgetStub` — `updateTimeline`, `getTimeline`, etc.
all do nothing). `createWidget()` and `updateSnapshot()` are safe to call
unconditionally on Android today; they just don't do anything, matching this
project's own `refresh.ts` comment ("expo-widgets is iOS-only... Android
resolves to a no-op stub rather than throwing").

## Why not extend `expo-widgets`' own `createWidget()`?

Because `WidgetsModule.kt` and this package's native module would both need
to register under the same name (`"ExpoWidgets"`) for `createWidget()` to
transparently start working on Android too, and two Expo modules claiming one
name is a real collision, not a style choice — whichever autolinks last wins,
silently, and that's not something to depend on. Patching
`node_modules/expo-widgets` directly isn't viable either (wiped on every
reinstall, not something to ship as an OSS package someone else installs
alongside the real one).

Instead this package registers its own native module,
**`"ExpoWidgetsGlance"`**, with its own tiny JS API (`index.ts`):

```ts
const layout = (props, environment) => { 'widget'; ... };
export default createWidget('NextClassWidget', layout);   // iOS, from expo-widgets
registerGlanceWidget('NextClassWidget', layout);            // Android, from this package
```

`registerGlanceWidget` does the `.toString()` capture explicitly in JS
(rather than relying on an implicit native coercion the way `expo-widgets`
does) and sends the resulting source text to `registerLayout` on our own
native module. Two calls instead of one, but zero risk of clobbering
`expo-widgets`' own Android module, and it doesn't require patching anything.

## Architecture

```
scripts/build-android-bundle.mjs   Rebuilds expo-widgets' own bundle/index.ts
                                    with --platform android instead of ios —
                                    the shared runtime described above. Not
                                    yet wired into a config-plugin hook to run
                                    automatically at prebuild time (see
                                    "What's not done yet") — run by hand today.

index.ts                            registerGlanceWidget(name, layout) /
                                    updateGlanceSnapshot(name, props) — the
                                    Android-side calls that sit next to
                                    expo-widgets' createWidget()/updateSnapshot()
                                    in a widget file. No-ops on iOS.

plugin/                            Expo config plugin. Adapted from
                                    expo-widgets' own (MIT-licensed)
                                    withAndroidWidgetManifest.ts /
                                    withAndroidWidgetFiles.ts, reading the
                                    *same* widgets[] array so there's one
                                    source of truth for "what widgets exist,"
                                    not two: generates one
                                    `${name}GlanceProvider` Kotlin class +
                                    widget-info XML + manifest <receiver> per
                                    widget whose `android` field isn't `null`,
                                    pointed at *our* ExpoWidgetsGlanceReceiver
                                    base class.

android/.../WidgetJsHost.kt         Loads the shared runtime bundle text +
                                    a widget's layout source into QuickJs
                                    (app.cash.zipline:zipline's public,
                                    @EngineApi-gated `QuickJs` class — the
                                    same underlying engine family expo-widgets
                                    uses on iOS, JVM binding instead of the
                                    JavaScriptCore one) and evaluates
                                    `JSON.stringify(__expoWidgetRender(...))`.
                                    Deliberately NOT full Zipline: Zipline's
                                    public API assumes both sides are
                                    Kotlin/JS-compiled, talking over its own
                                    RPC bridge — QuickJs (evaluate a script,
                                    get a primitive back) is the right-sized
                                    primitive for "run an arbitrary plain JS
                                    bundle and read back a JSON string."
                                    Also has `handlePress` for the
                                    `__expoWidgetHandlePress` half of the
                                    Button-tap protocol (see below).

android/.../RenderNode.kt           Kotlin data class parsed from the
                                    `{type, props}` JSON — the Android mirror
                                    of what DynamicView.swift consumes.

android/.../ModifierRegistry.kt     `$type` string → GlanceModifier /
                                    TextStyle mapping. See "Coverage" —
                                    every modifier in `@expo/ui/swift-ui`'s
                                    surface has an entry, but not every entry
                                    can *do* anything on Glance.

android/.../GlanceTreeRenderer.kt   Recursive @Composable that walks a
                                    RenderNode tree and emits Glance
                                    components (Column, Row, Box, Text, ...).

android/.../WidgetsGlanceStore.kt   Where a widget's layout source and most
                                    recent snapshot live — a global (not
                                    per-GlanceId) DataStore Preferences store,
                                    keyed by widget name. Global rather than
                                    per-instance because a pushed snapshot is
                                    "here is the current data," the same for
                                    every home screen instance of that widget
                                    kind — mirroring how expo-widgets on iOS
                                    reloads every instance of a widget kind
                                    together (`WidgetCenter.reloadTimelines
                                    (ofKind:)`), not per-instance state.

android/.../ExpoWidgetsGlanceModule.kt
                                    registerLayout(name, source) /
                                    updateSnapshot(name, propsJson) — the two
                                    functions index.ts calls. Forces an
                                    immediate repaint after a snapshot push by
                                    instantiating the generated
                                    `${name}GlanceProvider` via reflection
                                    (by naming convention — this library
                                    module has no compile-time reference to
                                    classes generated into the *app's*
                                    package at prebuild time) and calling
                                    `GlanceAppWidget.updateAll`.

android/.../ExpoWidgetsGlanceWidget.kt / ExpoWidgetsGlanceReceiver.kt
                                    The real GlanceAppWidget + receiver base
                                    classes the generated provider
                                    subclasses extend, replacing upstream's
                                    `Text(widgetName)` stub. Reads the layout
                                    + snapshot for its name out of
                                    WidgetsGlanceStore, runs WidgetJsHost,
                                    renders the result.

android/.../HandlePressAction.kt   Glance ActionCallback wiring up
                                    `Button`'s `target` prop (assigned by
                                    expo-widgets' own decorator.ts) to
                                    WidgetJsHost.handlePress — the two-call
                                    protocol where rendering always goes
                                    through JSON (safe, but drops function
                                    props like `onButtonPress`) and handling
                                    a press re-runs the layout function fresh
                                    so that closure exists again in memory.
                                    Untested — neither of this app's two real
                                    widgets uses Button yet.
```

## Coverage

WidgetKit itself only allows a restricted subset of SwiftUI inside widget
timeline content — no scrolling, no navigation, no most interactive controls
— so "every `@expo/ui/swift-ui` export" and "every export that could ever
legally appear in a widget" are different lists. The registries below cover
the full JS surface either way: anything genuinely illegal in a widget (or
not yet ported) renders as a visible `Unsupported: <Type>` fallback and logs
a warning once per process, rather than silently vanishing.

**Components — real Glance rendering:** VStack, HStack, ZStack, Group,
LazyVStack/LazyHStack (aliased to VStack/HStack — a fixed-size widget has no
lazy layout to speak of), Text, Spacer, Divider, Label (title only —
`systemImage`, an SF Symbol name, has no Android drawable mapped yet),
LabeledContent, Link, Button (`label`/`children`, not `systemImage`),
Rectangle/RoundedRectangle/Circle/Ellipse/Capsule,
Gauge/ProgressView (both fall back to a plain percentage label — Glance's
`defaultWeight()` only supports equal weighting between Row/Column siblings,
not an arbitrary fraction, so there's no cheap way to draw an actual
proportional bar yet), Image — but only via `assetName`, resolved against a
drawable of the same name in the *host app's* own `res/drawable` (see
`GlanceTreeRenderer.kt`'s `AssetDrawables`, and the section below). Android
has no SF Symbol catalog, so `systemName` has nothing to resolve against and
falls back below, as does `uiImage`.

**Components — logged fallback (not legal in WidgetKit content, or genuinely
out of scope for now):** Alert, BottomSheet, ColorPicker, ConfirmationDialog,
ContextMenu, ControlGroup, DatePicker, DisclosureGroup, Form, List, Menu,
Picker, Popover, ScrollView, SecureField, Slider, Stepper, SwipeActions,
TabView, TextField, Toggle/SyncToggle (needs App Intents — not attempted
yet), ShareLink, GlassEffectContainer, Section, Grid (falls back rather than
attempting a real grid layout), Image via `systemName` or `uiImage` (see
above), Chart, RNHostView,
Namespace, Host, AccessoryWidgetBackground (lock-screen-only, correctly a
no-op on a home screen widget).

**Modifiers — real Glance mapping:** padding, frame (approximate — see the
`Infinity`-through-JSON note in `ModifierRegistry.kt`; Glance sizing is
coarser than SwiftUI's regardless), font (size/weight; `design`/`family`
not mapped yet), foregroundStyle/foregroundColor (plain color case only —
gradients and hierarchical styles fall back to default black), background,
containerBackground, cornerRadius, clipShape (roundedRectangle only),
multilineTextAlignment, bold, italic, lineLimit, widgetURL, the `target`
half of Button interactivity (see HandlePressAction.kt above).

**Modifiers — logged no-op (Glance has no equivalent):** border
(approximated via a nested background box, not a true stroke — see the code
comment), opacity (Glance has no generic alpha compositing), shadow, blur,
rotation/scale/3D effects, glassEffect, matchedGeometryEffect,
monospacedDigit, and the list/scroll/text-field-specific modifiers that only
make sense on a component this renderer already falls back on.

## Design pattern: a positioned grid without a positioning primitive

A calendar/timetable design almost always specs each event by an absolute
pixel offset and height against a time axis — and neither `@expo/ui/swift-ui`'s
widget-safe subset nor this renderer has anything resembling "place this box
at this exact (x, y)". Checked directly against the resolved jar: there is no
`Modifier.offset()` (or equivalent) anywhere in Jetpack Glance's public API.
This isn't a gap in this package specifically — the primitive doesn't exist
to map to.

The workaround reproduces the same visual result without needing it: lay out
a day's events as an ordinary `VStack` of alternating `Spacer`s (sized to the
gap before each event) and event blocks (sized to the event's duration).
Given events sorted by start time, walk them once, tracking how much time has
elapsed so far; the gap before each event is `event.start - elapsed`, turned
into a `Spacer` height via a `pxPerMinute` scale factor. This computes to
exactly the positions absolute placement would have produced, using nothing
but `frame`'s fixed width/height — a modifier every renderer here already
supports. A background hour-grid (thin `Divider`s at fixed intervals) and the
foreground event column are two separate `VStack`s layered in one `ZStack`;
they only need to agree on total height to land on top of each other
correctly. See `examples/TimeGridWidget.tsx` for the complete, working
version of this — verified against a real render (five day columns, an hour
axis, correctly-positioned colored blocks).

## Design pattern: border-box decoration vs. content-box padding

There's no `border` primitive in this renderer that only paints one edge
(Glance has no per-side border at all — see "Modifiers" above), so a
Figma design with a flat left-accent-bar-on-a-highlighted-row treatment
(`TodayClassesWidget.tsx`'s schedule rows) has to be built from a plain
`Rectangle` positioned by hand. The first version of that row put the
accent `Rectangle` as a sibling of the row's own padded content, inside a
single `HStack` that carried both the background tint AND the
`padding({horizontal:8, vertical:4})` — which inset the bar by 8dp along
with everything else, when Figma's design has it flush against the row's
true edge (a CSS border-box decoration, not a content-box one).

The general fix, not a one-off hack: split the row into two nesting
tiers. The OUTER `HStack` carries no padding — it's the row's actual
bounds, and anything meant to sit flush against them (this accent bar; a
future top/bottom border or corner badge) goes here as a direct,
unpadded child. The INNER `HStack` owns the padding and wraps only the
actual content (time/name/room). This generalizes to any "edge
decoration + inset content" layout, not just this one bar — see the
`row()` function for the concrete before/after.

**A genuine gotcha hit while verifying this fix**: pushing a new
`layoutSource` (via `registerLayout`) and calling `updateSnapshot`
(which force-repaints via `updateAll`) on an *existing* widget instance
did NOT visibly update the on-screen render — even confirmed, byte for
byte, that the new layout source was the one persisted in DataStore, and
even after that widget instance was freshly re-added to the home screen.
Removing the widget and re-adding it *again*, or simply relaunching the
app a second time (which re-registers the layout and re-fires
`updateSnapshot` a second time against the now-settled instance), made
the fix appear. The most likely explanation: a widget instance that's
just been placed goes through a restore/inflate path (`adb logcat`
showed `restoreErrorType=unspecified_widget_inflation_result` on
creation) that can serve one stale composed frame before the "real"
`provideGlance` pipeline takes over — the first `updateSnapshot` call
can race that inflation and get silently superseded. Concretely: don't
trust the very first post-install render when verifying a layout change
on a real device/emulator — force a second `updateSnapshot` (e.g.
relaunch the app once more) before concluding a fix didn't work.

## More bugs found while extending the fix above

Making that same accent bar span the row's full height (not just its own
text line) surfaced two more real limitations, in the same session:

- **`frame({maxHeight: Infinity})` on a Row/Column child doesn't just stretch
  that child — it can inflate the child's own container against *its*
  parent.** Tried on the `Rectangle` directly (a plain sibling in the row's
  outer `HStack`): the whole row ballooned to consume all remaining vertical
  space in the schedule list's outer `VStack`, silently swallowing the two
  rows after it. Suspecting this was a Row-specific co-measurement problem,
  the row was rebuilt as a `ZStack`/Box instead (Box normally sizes itself to
  its largest child and lets others independently fill to match — the
  ordinary Android FrameLayout pattern, not linear co-measurement) — same
  result. Confirmed conclusion: Glance's AppWidget/RemoteViews translation
  doesn't do free-form, deferred measurement the way real Compose UI does; it
  picks from a small set of pre-built layout templates, and an unbounded fill
  request reliably bubbles up through every ancestor regardless of container
  type. There is no reliable way to make one element "fill exactly as tall as
  its sibling turns out to be" in this renderer — the fallback is a fixed
  height, measured off an actual render, with a comment explaining why it's
  hardcoded rather than computed.
- **`frame`'s `alignment` field was silently ignored.** SwiftUI's
  `frame(maxWidth: .infinity, alignment: .trailing)` both grows a view *and*
  positions its own content within that extra space — `ModifierRegistry.kt`
  only implemented the growing half (`fillMaxWidth()`/`defaultWeight()`), so
  a `Text` filled this way still drew at its default (leading) position,
  leaving two header labels that were supposed to sit at opposite ends of a
  row stuck together on the left with the fill space sitting invisibly after
  the second one. Fixed generally: `frame`'s `alignment` now sets
  `TextStyle.textAlign` (`leading`/`trailing`/`center`, the axis this
  matters for) whenever present, not just special-cased per call site.

## `Image`, SF Symbols, and `assetName`

`@expo/ui/swift-ui`'s `Image` takes three mutually exclusive sources, and
only one of them can be made to work on both platforms.

`systemName` is an SF Symbol name — meaningful only on iOS, where the OS
ships a huge built-in icon catalog. Android has nothing resembling that
catalog, so "map any SF Symbol name to an Android drawable" isn't a real
strategy: there's no source to map *from*. An earlier version of this
package carried a small hand-maintained allowlist pairing individual symbol
names to drawables bundled here, which worked but scaled badly and put
app-specific artwork inside a general-purpose renderer. It's gone.

`assetName` is the supported path. On iOS it names an entry in the widget
target's asset catalog; there's no Android equivalent this package could
own, so the contract is by convention: the app ships a vector drawable in
its *own* `res/drawable` named after the same asset, and both platforms then
resolve one name from one `<Image assetName="..." />`. The lookup is
`Resources.getIdentifier` against the app's package (`AssetDrawables`), with
a PascalCase→snake_case conversion in between, since asset catalog names are
conventionally `BusIcon` while Android resource names must match `[a-z0-9_]`.

Resolving against the app rather than this package is the point: an icon a
widget draws belongs to the app that designed the widget, the same way its
layout does. This library bundles no artwork.

Sizing and tinting need no separate path — `color`/`size` on `Image` already
fold into `foregroundStyle`/`font` modifiers, so the existing
`TextStyle.color` plumbing supplies the tint via `ColorFilter.tint`. That
also means a drawable resolved here should be a monochrome template: one
file serves every color the widget needs.

Anything unresolvable — `systemName`, `uiImage`, or an `assetName` with no
matching drawable — renders a visible placeholder and logs once, rather than
silently vanishing.

## Timelines

`expo-widgets` gives WidgetKit a list of future-dated entries and WidgetKit
swaps between them on its own clock. Glance has nothing like it: a widget
shows what it was last composed with until something repaints it. The
original Android answer was a single snapshot plus refresh-on-display, which
left anything time-based frozen — a bus countdown ran on past zero into
`-1:30`, because the entry that should have removed the bus never existed
here.

`updateGlanceTimeline` stores the same entries (`timeline_<name>`, replacing
any snapshot). Two pieces make it behave like WidgetKit:

- **The render picks the entry by the clock** (`WidgetTimeline.current`, via
  `WidgetsGlanceStore.readCurrentProps`), on every composition. Nothing else
  decides which entry is showing.
- **One pending repaint per widget.** `WidgetTimeline.scheduleNext` enqueues a
  unique `OneTimeWorkRequest` (`ExistingWorkPolicy.REPLACE`) for the next
  entry still ahead; `WidgetTimelineWorker` repaints every instance of that
  widget (by receiver — see below), then schedules the entry after.

Because the render chooses, a worker that runs late — WorkManager defers
under Doze — still lands on the right entry. What it can't fix is anything
that moves *between* repaints: a Chronometer keeps ticking and doesn't stop at
zero. So a layout should stop drawing a countdown in the entry before its
deadline; 인입런 shows "잠시후" for a bus's last minute for exactly this.

An entry can carry `refresh: true`, which makes the worker also start the
refresh task (unconditionally, not `requestIfStale` — the app is saying the
data runs out at this moment). 인입런 sets it every 20 seconds through each
on-screen bus's last minute and a little past its due time — a single refetch
at the "잠시후" flip usually still saw the bus coming and asked nothing more,
leaving the row stuck on "잠시후". Refresh moments that aren't visual
boundaries still get an entry (same props) purely as a wake-up. A plain `updateGlanceSnapshot` cancels any pending timeline repaint.

## Never `updateAll`: every widget shares one GlanceAppWidget class

Each generated `${name}GlanceProvider` is its own receiver, but all of them
construct the same `ExpoWidgetsGlanceWidget` class — the widget name is a
constructor argument, not a subclass. Glance's `GlanceAppWidget.updateAll`
collects instances by *class* (`GlanceAppWidgetManager.getGlanceIds(javaClass)`,
backed by a receiver → provider-class map it persists), so from any one
widget it returns every INTIP widget on the home screen, and repaints them
all through the calling instance's `provideGlance`: the calling widget's
name, layout and snapshot. On device, a refresh on one widget turned every
other widget into a copy of it.

A repaint therefore goes by receiver component —
`AppWidgetManager.getAppWidgetIds(ComponentName(context, receiverClass))`,
then `update(context, getGlanceIdBy(id))` per id — which is what
`ExpoWidgetsGlanceModule.forceRepaint` does. A session already started by the
wrong instance keeps its content until Glance closes it, so after a fix like
this, restart the app process before judging the result.

## Widget options (configuration)

iOS gives a configurable widget an AppIntent: `expo-widgets` generates one
from app.json's `configuration`, WidgetKit shows "Edit Widget" for it, and the
generated entry view passes the chosen values to the layout as
`environment.configuration` (enums as their raw string value). The Android
side aims for the same contract — same declaration, same key, same shapes —
so a layout never branches on platform to read an option.

**How the pieces find each other.** The launcher starts the configure
activity with nothing but an appWidgetId. `AppWidgetManager.getAppWidgetInfo`
turns that into the widget's receiver component, and the config plugin puts
the widget's declaration on that receiver as meta-data pointing at a
generated `res/raw/*_glance_configuration.json`. So one generic
`ExpoWidgetsGlanceConfigureActivity` serves every configurable widget, and
the renderer finds the same declaration by the `${name}GlanceProvider`
naming convention (`WidgetConfigurationSpec.forWidget`).

**Per instance, and in Glance's state rather than the store.** A snapshot
and a layout are per widget *name*, because pushed data is the same for
every instance. Options are not — two 학식 widgets on one screen can each
show a different cafeteria — so they live in Glance's own per-instance state
(`WidgetInstanceState`, on `PreferencesGlanceStateDefinition`), which Glance
also deletes when the widget is removed.

The first version kept them in `WidgetsGlanceStore` keyed by appWidgetId, and
a new choice showed up only "once in a while." `GlanceAppWidget.update` on a
session that is already running re-reads the instance's Glance state and
recomposes only if that changed; a value read from anywhere else inside the
composition is never read again, so the choice appeared only when the session
had happened to close first. The render now reads the option with
`currentState`, which subscribes the composition to it.

**Resolved, not trusted.** A stored choice passes through
`WidgetConfigurationSpec.resolve` on every read: a value whose type doesn't
match, or an enum value the current declaration no longer lists, becomes the
default. App updates can change a declaration under an existing instance;
the layout should only ever see values the current declaration allows.

**The same trap applies to every repaint.** A pushed snapshot is per widget
name, so it can't move into per-instance state — but a running session has
to be told to re-read it all the same. `forceRepaint` and `HandlePressAction`
therefore write a throwaway token (`WidgetInstanceState.repaintKey`) before
calling `update`; the render subscribes to it, and the recomposition it
causes re-reads the store. `HandlePressAction` resolves options through the
same state, so a button press re-runs the layout against the options the user
is looking at.

**`configuration_optional|reconfigurable`.** Placing the widget with defaults
and editing later is how iOS behaves; forcing the configure screen on
placement would make Android the odd one out.

**System dialogs, not a screen.** One `AlertDialog` per parameter over a
translucent activity, in the device's DeviceDefault theme (One UI's on
Samsung). It needs no UI toolkit or theme from the host app, and matches what
platform reconfigure flows look like.

## What's not done yet

- Only each widget's one sample state has actually been looked at on a
  screen (`NextClassWidget`'s `upcoming`, `TodayClassesWidget`'s `normal`).
  The other states (`dayOff`, `noTimetable`, `ongoing`, ...) run through the
  same code path but haven't been individually confirmed — worth checking,
  not expected to be surprising given both sample states now render
  correctly end to end.
- `scripts/build-android-bundle.mjs` needs a real config-plugin hook (a
  `withDangerousMod` on `android`, mirroring how `expo-widgets` runs its own
  bundle script from an Xcode build phase) to run automatically during
  prebuild/build instead of requiring a manual run before every native
  rebuild (done by hand for the testing above).
- `ExpoWidgetsGlanceModule`'s force-repaint uses `kotlinx.coroutines.runBlocking`
  from a native-module function, and `ExpoWidgetsGlanceWidget`'s render path
  does the same to bridge `WidgetsGlanceStore`'s suspend reads into
  `provideContent`'s non-suspend composable body. Both work but are exactly
  the kind of "made it compile, not the right shape" shortcut a real pass
  should replace — precompute in `provideGlance` (which *is* suspend) and
  pass values into `provideContent`, rather than blocking inside it.
- `Image` has no SF-Symbol-name (or arbitrary asset) → Android drawable
  resolution strategy at all yet — needs one before Image renders anything.
- Interactive Button/Toggle: the plumbing exists (`HandlePressAction`,
  `decorator.ts`'s `target` scheme) but has never been exercised against a
  real widget that uses `Button`.
- `android:updatePeriodMillis="0"` in the generated widget-info XML — same
  as expo-widgets' own — means Android never auto-repaints a widget on a
  timer; every repaint has to come from `updateSnapshot`'s forced-repaint
  path (or a config change / reboot). That path exists now but is unverified.

## License note

`plugin/src/withAndroidWidgetManifest.ts` and `withAndroidWidgetFiles.ts` are
adapted from `expo-widgets` (MIT, © 650 Industries, Inc.) — same license
here, attribution kept in each file's header.
