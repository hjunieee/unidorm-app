import { requireNativeModule } from 'expo-modules-core';
import { AppRegistry, Platform } from 'react-native';

/**
 * Deliberately not `expo-widgets`' own `createWidget()`/`Widget.updateSnapshot()`
 * — see README "Architecture" for why: making `expo-widgets`' `"ExpoWidgets"`
 * native module resolve to something real on Android, instead of its own
 * (perfectly intentional, see `ExpoWidgets.js`'s `WidgetStub`) no-op, isn't
 * possible without either patching that package or racing two modules for
 * the same registered name. This package's native module is named
 * `"ExpoWidgetsGlance"` instead, so it installs alongside `expo-widgets`
 * without touching it.
 *
 * A widget file ends up calling both:
 * ```ts
 * const layout = (props, environment) => { 'widget'; ... };
 * export default createWidget('NextClassWidget', layout);   // iOS, from expo-widgets
 * registerGlanceWidget('NextClassWidget', layout);           // Android, from this package
 * ```
 */
const ExpoWidgetsGlanceModule: {
  registerLayout(name: string, layoutSource: string, refreshIntervalMs: number | null): Promise<void>;
  updateSnapshot(name: string, propsJson: string): Promise<void>;
  updateTimeline(name: string, entriesJson: string): Promise<void>;
} | null = Platform.OS === 'android' ? requireNativeModule('ExpoWidgetsGlance') : null;

/**
 * Registers a widget's layout function for Android rendering. Call once,
 * same place `createWidget` is called for iOS — typically at module scope in
 * the widget's own file, right next to (not instead of) the `createWidget`
 * call.
 *
 * Sends `layout.toString()` — the function's own source text, exactly as
 * written (including the `'widget'` directive as its first statement) — to
 * the native module, which persists it for `provideGlance` to evaluate
 * later. See `WidgetsGlanceStore.kt`'s doc for why this is the same thing
 * `expo-widgets` itself ends up persisting for iOS, just captured explicitly
 * in JS here instead of implicitly during a native argument conversion.
 *
 * No-op on platforms other than Android.
 *
 * `options.refreshIntervalMs` opts the widget into refreshing itself — see
 * `GlanceWidgetOptions` and `registerGlanceRefreshTask`.
 *
 * `Props`/`Environment` are inferred from the layout function that's passed
 * in; the layout is only ever stringified here, so this package neither reads
 * nor constrains their shape. They're generic rather than `unknown` because
 * parameter types are contravariant under `strictFunctionTypes` — a layout
 * declared as `(props: MyWidgetProps, environment: WidgetEnvironment) => ...`,
 * which is how `expo-widgets` layouts are written, is *not* assignable to a
 * parameter typed `(props: unknown, environment: unknown) => unknown`, so
 * every caller with a typed layout failed to compile.
 */
export function registerGlanceWidget<Props, Environment>(
  name: string,
  layout: (props: Props, environment: Environment) => unknown,
  options?: GlanceWidgetOptions
): void {
  if (ExpoWidgetsGlanceModule == null) {
    return;
  }
  ExpoWidgetsGlanceModule.registerLayout(
    name,
    layout.toString(),
    options?.refreshIntervalMs ?? null
  );
}

/**
 * Pushes a new snapshot for a widget registered with `registerGlanceWidget`.
 * The Android counterpart of `expo-widgets`' `Widget.updateSnapshot(props)`
 * — call it wherever that's already called for iOS.
 *
 * No-op on platforms other than Android.
 */
export function updateGlanceSnapshot(name: string, props: Record<string, unknown>): void {
  if (ExpoWidgetsGlanceModule == null) {
    return;
  }
  ExpoWidgetsGlanceModule.updateSnapshot(name, JSON.stringify(props));
}

/** One entry of {@link updateGlanceTimeline}. */
export type GlanceTimelineEntry = {
  /** When this entry becomes the one shown. */
  date: Date;
  props: Record<string, unknown>;
  /**
   * Also start the refresh task (see `registerGlanceRefreshTask`) when this
   * entry comes due — for data you know will be used up at that moment, like
   * a bus estimate about to reach zero. Android only; ignored elsewhere.
   */
  refresh?: boolean;
};

/**
 * Pushes a timeline for a widget registered with `registerGlanceWidget` — the
 * Android counterpart of `expo-widgets`' `Widget.updateTimeline(entries)`, so
 * a push can hand both platforms the same entries.
 *
 * The widget shows the latest entry whose `date` has passed (the first entry
 * before any has) and repaints itself when each later entry comes due, with no
 * app process involved. Repaints are scheduled with WorkManager, which can run
 * a little late — the render still picks the right entry by the clock then,
 * but anything that keeps moving between entries (a `dateStyle="timer"`
 * countdown) should stop before it can overrun, since a late repaint can't
 * take it back.
 *
 * No-op on platforms other than Android.
 */
export function updateGlanceTimeline(name: string, entries: GlanceTimelineEntry[]): void {
  if (ExpoWidgetsGlanceModule == null) {
    return;
  }
  const serialized = [...entries]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((entry) => ({ timestamp: entry.date.getTime(), props: entry.props, refresh: entry.refresh === true }));
  ExpoWidgetsGlanceModule.updateTimeline(name, JSON.stringify(serialized));
}

/**
 * The `target` for a widget button that refreshes the widget's data in place
 * (Android only):
 *
 * ```tsx
 * <Button target="__expo_widgets_glance_refresh">…</Button>
 * ```
 *
 * A tap starts the task registered with `registerGlanceRefreshTask`, exactly
 * as a stale render would, minus the staleness check. Spell the string out in
 * the layout — a widget layout function can't import this constant, because
 * only its own source text reaches the renderer.
 *
 * There is no iOS equivalent. A WidgetKit button runs its intent in the widget
 * extension, which has no network and can't reach the app process, so a
 * refresh there has to open the app.
 */
export const GLANCE_REFRESH_TARGET = '__expo_widgets_glance_refresh';

/** Options for `registerGlanceWidget`. */
export type GlanceWidgetOptions = {
  /**
   * How old this widget's snapshot may get before drawing it should also go
   * ask for new data, in milliseconds. Omit — the default — and the widget
   * only ever shows what the app has pushed it.
   *
   * When set, rendering the widget with a snapshot older than this starts the
   * headless task registered by `registerGlanceRefreshTask`. Nothing waits for
   * it: the widget draws what it has, and the fresh data arrives as a later
   * repaint (see `WidgetRefreshTask.kt`).
   *
   * Treat this as a floor, not a schedule. Nothing here *causes* a widget to
   * be drawn — Android decides that — so this can only make an update that was
   * going to happen anyway also fetch. Setting it to a minute does not produce
   * a widget that updates every minute; it produces one that fetches on
   * essentially every repaint, which costs a JS runtime boot each time. Pick
   * the largest value the data can tolerate.
   */
  refreshIntervalMs?: number;
};

/**
 * Registers the JS side of refresh-on-display.
 *
 * `handler` is called with the name of the widget being drawn, in the app's
 * own JS runtime — started for this if the app wasn't running — and should do
 * whatever the app normally does to produce that widget's data, ending in
 * `updateGlanceSnapshot`. Pushing a snapshot is what marks the refresh as
 * having succeeded; a handler that returns without pushing one leaves the
 * widget stale and it will try again on the next repaint.
 *
 * Call this at module scope from the app's entry file, *before* anything that
 * can suspend. A headless start evaluates the bundle and then immediately
 * looks the task up by name, so a registration that happens inside a component
 * (or after an `await`) is not registered yet when it's needed, and React
 * Native logs an unknown-task warning instead.
 *
 * No-op on platforms other than Android.
 */
export function registerGlanceRefreshTask(
  handler: (widgetName: string) => Promise<void>
): void {
  if (Platform.OS !== 'android') {
    return;
  }
  // Must match `WidgetRefreshTask.TASK_KEY`.
  AppRegistry.registerHeadlessTask(
    'ExpoWidgetsGlanceRefresh',
    () =>
      async (data: { widgetName?: string }) => {
        await handler(data?.widgetName ?? '');
      }
  );
}
