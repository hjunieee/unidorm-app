# Guide for AI agents

This file is for an AI coding agent (Claude Code, Cursor, etc.) doing either
of two things: **(A) writing a widget** in a project that consumes this
package, or **(B) contributing to this package itself**. Read the section
that applies; the constraints in "Writing widget code" apply either way,
since (B) usually means testing against a real widget too.

For the full technical background behind every rule below — why each one is
true, and how it was discovered — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
This file is the condensed, actionable version; that one is the reference.

## Mental model, in one paragraph

A widget is one function, tagged with a `'widget'` directive as its first
statement. Calling `registerGlanceWidget(name, layout)` (this package) and
`createWidget(name, layout)` (`expo-widgets`) both do the same thing under
the hood: capture `layout.toString()` — the function's **own source text,
exactly as written** — and persist it. Later, on Android, this package
evaluates that source inside a small JS engine (QuickJS) alongside a shared
runtime bundle that defines `VStack`/`Text`/every modifier as globals, gets
back a plain `{type, props}` tree, and a Kotlin renderer (`GlanceTreeRenderer.kt`)
walks that tree and emits real Jetpack Glance composables. iOS does the
equivalent with JavaScriptCore and real SwiftUI views. Same source, two
completely different render pipelines — which is exactly why the constraints
below exist.

## Writing widget code: hard constraints

These aren't style preferences — violating them produces widgets that build
fine and fail silently or with a confusing error, discovered the hard way
while building this package.

- **Only the function's own source text ships to the widget process.**
  A `const` declared at module scope, above the widget function, is
  `undefined` inside it at render time — not a closure, a completely fresh
  evaluation with nothing in scope but whatever the shared runtime bundle
  provides as globals. Every constant a widget function needs (colors, magic
  numbers, helper functions) must be declared **inside** that function's own
  body.
- **Never spell out a literal backslash-n escape sequence inside a widget
  function** — not in a string literal, and not even inside a `//` comment
  describing the bug. Somewhere in the Metro/Hermes pipeline that produces
  the persisted source text, that two-character sequence gets corrupted into
  a real newline byte, breaking whatever it lands inside (a string literal,
  or — if it's in a comment — silently turning the rest of that comment line
  into live, broken code). If a widget needs multiple lines of text, render
  them as separate `<Text>` elements instead of one string with an embedded
  line break.
- **No live measurement on Android — an element can't reliably "fill exactly
  as tall/wide as its sibling."** Real Compose UI does two-pass constraint
  layout; Glance's RemoteViews translation picks from a small set of
  pre-built layout templates. A `frame({maxHeight: Infinity})` (or `Infinity`
  width) on a Row/Column child doesn't just stretch that child — it can
  inflate the *child's own container* against its parent, silently pushing
  siblings out of view. If a design needs "this element matches that
  element's height," measure it once against a real render and hardcode the
  number, with a comment saying why it's hardcoded (see
  `examples/ListWidget.tsx`'s `ROW_HEIGHT`).
- **There's no per-side border.** For a design with a flush edge decoration
  (a left accent bar, say) next to independently-padded content, split the
  container into two nesting tiers: an outer, unpadded container holding the
  decoration (so it sits flush against the true edge), and an inner,
  padded one holding the actual content. Putting both in one padded
  container insets the decoration along with everything else. See
  `docs/ARCHITECTURE.md`'s "border-box vs. content-box" section and
  `examples/ListWidget.tsx` for the concrete pattern.
- **`frame`'s `alignment` only affects `Text` content alignment, nothing
  else.** `frame({maxWidth: Infinity, alignment: 'trailing'})` grows an
  element and right-aligns *its own text*, not the element's position
  relative to siblings. To push two elements to opposite ends of a row, use
  a `<Spacer />` between them (Glance's `defaultWeight()`), not a fill+
  alignment modifier on the second one.

## Testing on a real device or emulator

- **The very first render after a widget is freshly placed on a home screen
  can be stale**, even after confirming the correct layout source is
  persisted. Android's restore/inflate path can serve one composed frame
  before the real render pipeline takes over, and the first `updateSnapshot`
  call can race it. Don't conclude a fix didn't work from the first render —
  force a second update (relaunch the app once more, or push another
  snapshot) before deciding something is actually broken.
- **A dev-client's "Reload" can silently keep serving old JS**, or even crash
  the JS runtime on a second reload in the same session. If widget code
  changes stop showing up in a persisted layout dump despite edits and
  reloads, restart Metro fresh (`npx expo start --clear`) rather than
  debugging further against a possibly-stale bundle.
- **Verify what's actually persisted, not just what you expect.** This
  package stores each widget's layout source and latest snapshot in
  DataStore Preferences, readable via
  `adb shell run-as <package> cat files/datastore/expo_widgets_glance.preferences_pb`.
  Grepping that output for a distinctive string from a recent edit is the
  fastest way to confirm a change actually reached the widget process,
  before spending time debugging the Kotlin render side.

## Contributing to this package: adding a new component or modifier

1. Add the mapping in `android/src/main/java/expo/modules/widgetsglance/GlanceTreeRenderer.kt` (components) or `ModifierRegistry.kt` (modifiers).
2. **If Glance genuinely can't express it, don't skip it silently.** Call
   `ModifierRegistry.warnUnsupportedComponent(type)` (or the existing
   `warnUnsupported` helper for modifiers) and render a visible fallback —
   this package's whole design principle is "every gap is visible and
   logged once," never a silently-missing element. Follow that convention
   for anything new too.
3. Update the **Coverage** section in both `README.md` and `README.ko.md`
   (move the item from the unmapped list to the mapped one, or add it if
   it's a new export from `@expo/ui/swift-ui` entirely) and, if the mapping
   needed a non-obvious workaround, add a note to `docs/ARCHITECTURE.md`
   explaining why — future readers (agents included) shouldn't have to
   rediscover the same platform limitation from scratch.
4. Test against a real render, not just a successful compile — this
   renderer's failure mode for a real platform limitation is usually "builds
   fine, looks visually wrong or explodes the layout," not a compile error
   or exception. See "Testing on a real device or emulator" above.
