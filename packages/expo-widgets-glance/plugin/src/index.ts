import { ConfigPlugin } from 'expo/config-plugins';

import withAndroidWidgetFiles from './withAndroidWidgetFiles';
import withAndroidWidgetManifest from './withAndroidWidgetManifest';
import { GlanceWidgetConfig } from './types';

/**
 * Reads the *same* `widgets[]` array passed to app.json — this plugin does
 * not introduce a second widget list to keep in sync with expo-widgets' own.
 * A widget only gets Android files generated for it if its entry's
 * `android` field is present and not `null` (matching expo-widgets'
 * `android !== null` convention on the iOS side), so per-widget opt-out is
 * just `"android": null` in the same config object.
 *
 * Usage in app.json, alongside the existing expo-widgets plugin entry:
 * ```json
 * ["expo-widgets-glance", { "widgets": [ ... same widgets[] as expo-widgets ... ] }]
 * ```
 */
const withExpoWidgetsGlance: ConfigPlugin<{ widgets: GlanceWidgetConfig[] }> = (
  config,
  { widgets }
) => {
  const androidWidgets = widgets.filter((widget) => widget.android !== null);
  if (androidWidgets.length === 0) {
    return config;
  }

  let nextConfig = withAndroidWidgetFiles(config, androidWidgets);
  nextConfig = withAndroidWidgetManifest(nextConfig, androidWidgets);
  return nextConfig;
};

export default withExpoWidgetsGlance;
