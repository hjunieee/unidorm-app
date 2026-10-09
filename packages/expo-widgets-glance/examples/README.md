# Examples

These are complete widget files, not snippets — copy one into your project's
widget directory and adjust. Both compile and render as written; neither
depends on anything outside `@expo/ui/swift-ui`, `expo-widgets`, and
`expo-widgets-glance`.

- **[`SimpleWidget.tsx`](SimpleWidget.tsx)** — the minimum viable widget: one
  state, dark-mode-aware colors, no data. Start here to confirm the plugin +
  build are wired up correctly before writing anything real.
- **[`ListWidget.tsx`](ListWidget.tsx)** — a more realistic widget: two
  states (`normal`/`empty`), a list built with `.map()`, and a highlighted
  row with a left accent bar demonstrating the border-box/content-box
  nesting pattern from [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
- **[`TimeGridWidget.tsx`](TimeGridWidget.tsx)** — a full weekly calendar
  grid (day columns × an hour axis, with positioned event blocks), built
  with no absolute-positioning primitive at all — neither this renderer nor
  `@expo/ui/swift-ui`'s widget-safe subset has one. Each day's events are
  laid out as alternating `Spacer`s (sized to the gap before an event) and
  blocks (sized to the event's duration), computing to the same positions
  absolute placement would have produced. Verified against a real render:
  five day columns, an hour grid, and correctly-positioned colored blocks,
  no offset modifier involved.

Both widgets are registered under their own file name (`SimpleWidget`,
`ListWidget`) — if you copy one in, that string is also what has to match
the `name` field in both config plugins' `widgets[]` entries in `app.json`.

For how to push data into a widget once it's registered, see the main
[README](../README.md#usage)'s `updateGlanceSnapshot`/`updateSnapshot`
example — it's the same for any widget, so it isn't duplicated per example
here.
