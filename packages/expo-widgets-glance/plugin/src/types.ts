/**
 * Deliberately a subset of expo-widgets' `WidgetConfig` — just the fields the
 * Android side actually needs. Widgets are still declared once, in the
 * `expo-widgets` plugin config (app.json); this plugin reads the same
 * `widgets[]` array so a widget's Android footprint stays in sync with its
 * iOS one without a second source of truth.
 */
export type GlanceWidgetConfig = {
  name: string;
  displayName: string;
  description: string;
  /**
   * Per-widget options the user picks on the home screen — the same shape as
   * expo-widgets' own `configuration` (iOS: an AppIntent). On Android it
   * becomes a configure activity the launcher opens from the widget's
   * "reconfigure" action, and the picked values reach the layout as
   * `environment.configuration`, exactly as on iOS.
   */
  configuration?: GlanceWidgetConfiguration;
  android?: {
    minWidth?: number;
    minHeight?: number;
    targetCellWidth?: number;
    targetCellHeight?: number;
    resizeMode?: 'none' | 'horizontal' | 'vertical' | 'both';
  } | null;
};

export type GlanceWidgetConfiguration = {
  title: string;
  description?: string;
  parameters: Record<string, GlanceWidgetParameter>;
};

/** Mirrors expo-widgets' `WidgetParameter`, so one app.json block serves both plugins. */
export type GlanceWidgetParameter =
  | { title: string; type: 'string'; default: string }
  | { title: string; type: 'number'; default: number }
  | { title: string; type: 'boolean'; default: boolean }
  | { title: string; type: 'enum'; values: { name: string; value: string }[]; default: string };
