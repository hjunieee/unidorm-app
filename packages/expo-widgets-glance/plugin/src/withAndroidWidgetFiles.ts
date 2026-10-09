// Adapted from expo-widgets (MIT, © 650 Industries, Inc.):
// node_modules/expo-widgets/plugin/src/android/withAndroidWidgetFiles.ts
//
// Generates, per widget: a tiny Kotlin provider subclass, an
// appwidget-provider info XML, and the display-name/description string
// resources it points at. Unlike upstream, the generated provider extends
// *our* ExpoWidgetsGlanceReceiver (real Glance rendering), not expo-widgets'
// own placeholder.

import { AndroidConfig, ConfigPlugin, withDangerousMod } from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

import {
  getProviderClassName,
  getWidgetConfigurationResourceName,
  getWidgetDescriptionResourceName,
  getWidgetDisplayNameResourceName,
  getWidgetInfoResourceName,
} from './resourceNames';
import { GlanceWidgetConfig } from './types';

/** Must match `ExpoWidgetsGlanceConfigureActivity`'s fully qualified name. */
const CONFIGURE_ACTIVITY = 'expo.modules.widgetsglance.ExpoWidgetsGlanceConfigureActivity';

const withAndroidWidgetFiles: ConfigPlugin<GlanceWidgetConfig[]> = (config, widgets) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const androidPackage = AndroidConfig.Package.getPackage(config);
      if (
        typeof androidPackage !== 'string' ||
        !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(androidPackage)
      ) {
        throw new Error(
          'Android package is required for expo-widgets-glance. Please set `android.package` in `app.json` or `app.config.js`.'
        );
      }

      const projectRoot = config.modRequest.platformProjectRoot;
      const packageDirectory = path.join(
        projectRoot,
        'app/src/main/java',
        ...androidPackage.split('.')
      );
      const xmlDirectory = path.join(projectRoot, 'app/src/main/res/xml');
      const valuesDirectory = path.join(projectRoot, 'app/src/main/res/values');
      const rawDirectory = path.join(projectRoot, 'app/src/main/res/raw');
      const widgetsXmlPath = path.join(valuesDirectory, 'expo_widgets_glance.xml');

      fs.mkdirSync(packageDirectory, { recursive: true });
      fs.mkdirSync(xmlDirectory, { recursive: true });
      fs.mkdirSync(valuesDirectory, { recursive: true });
      fs.mkdirSync(rawDirectory, { recursive: true });

      if (fs.existsSync(widgetsXmlPath)) {
        fs.rmSync(widgetsXmlPath);
      }
      fs.writeFileSync(widgetsXmlPath, createWidgetStringsXml(widgets));

      for (const widget of widgets) {
        const providerPath = path.join(packageDirectory, `${getProviderClassName(widget)}.kt`);
        if (fs.existsSync(providerPath)) {
          fs.rmSync(providerPath);
        }
        fs.writeFileSync(providerPath, createWidgetProviderKt(androidPackage, widget));

        const widgetInfoPath = path.join(xmlDirectory, `${getWidgetInfoResourceName(widget)}.xml`);
        if (fs.existsSync(widgetInfoPath)) {
          fs.rmSync(widgetInfoPath);
        }
        fs.writeFileSync(widgetInfoPath, createWidgetInfoXml(widget));

        // Removed when a widget loses its configuration, so a stale file can't
        // keep the configure activity offering options that no longer exist.
        const configurationPath = path.join(rawDirectory, `${getWidgetConfigurationResourceName(widget)}.json`);
        if (fs.existsSync(configurationPath)) {
          fs.rmSync(configurationPath);
        }
        if (widget.configuration) {
          assertValidConfiguration(widget);
          fs.writeFileSync(configurationPath, JSON.stringify(widget.configuration));
        }
      }

      return config;
    },
  ]);
};

const createWidgetProviderKt = (androidPackage: string, widget: GlanceWidgetConfig): string => {
  const { minWidth, minHeight } = getAndroidWidgetConfig(widget);

  return `package ${androidPackage}

import expo.modules.widgetsglance.ExpoWidgetsGlanceReceiver

class ${getProviderClassName(widget)} : ExpoWidgetsGlanceReceiver(${JSON.stringify(widget.name)}, ${minWidth}, ${minHeight})
`;
};

const createWidgetInfoXml = (widget: GlanceWidgetConfig): string => {
  const android = getAndroidWidgetConfig(widget);
  // `configuration_optional`: the widget is placed with its defaults, the way
  // iOS places a configurable widget, instead of the launcher forcing the
  // configure screen first. `reconfigurable`: the options stay editable from
  // the widget's long-press menu afterwards — iOS's "Edit Widget".
  const configurationAttributes = widget.configuration
    ? `
  android:configure="${CONFIGURE_ACTIVITY}"
  android:widgetFeatures="reconfigurable|configuration_optional"`
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="${android.minWidth}dp"
  android:minHeight="${android.minHeight}dp"
  android:targetCellWidth="${android.targetCellWidth}"
  android:targetCellHeight="${android.targetCellHeight}"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/glance_default_loading_layout"
  android:description="@string/${getWidgetDescriptionResourceName(widget)}"
  android:resizeMode="${getWidgetResizeMode(widget)}"${configurationAttributes}
  android:widgetCategory="home_screen" />
`;
};

/**
 * Fails the prebuild on a configuration the configure activity couldn't
 * honor, rather than shipping a widget whose default silently isn't one of
 * its own choices.
 */
const assertValidConfiguration = (widget: GlanceWidgetConfig): void => {
  for (const [name, parameter] of Object.entries(widget.configuration?.parameters ?? {})) {
    if (parameter.type === 'enum' && !parameter.values.some((value) => value.value === parameter.default)) {
      throw new Error(
        `expo-widgets-glance: '${widget.name}' parameter '${name}' has default '${parameter.default}', which is not one of its values.`
      );
    }
  }
};

const getWidgetResizeMode = (widget: GlanceWidgetConfig): string => {
  switch (widget.android?.resizeMode) {
    case 'none':
      return 'none';
    case 'horizontal':
      return 'horizontal';
    case 'vertical':
      return 'vertical';
    case 'both':
    default:
      return 'horizontal|vertical';
  }
};

const getAndroidWidgetConfig = (widget: GlanceWidgetConfig): NonNullable<GlanceWidgetConfig['android']> => ({
  minWidth: widget.android?.minWidth ?? 180,
  minHeight: widget.android?.minHeight ?? 110,
  targetCellWidth: widget.android?.targetCellWidth ?? 4,
  targetCellHeight: widget.android?.targetCellHeight ?? 2,
});

const escapeXmlSpecialChars = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const createWidgetStringsXml = (widgets: GlanceWidgetConfig[]): string => `<?xml version="1.0" encoding="utf-8"?>
<resources>
${widgets
  .map(
    (widget) => `  <string name="${getWidgetDisplayNameResourceName(widget)}">${escapeXmlSpecialChars(widget.displayName)}</string>
  <string name="${getWidgetDescriptionResourceName(widget)}">${escapeXmlSpecialChars(widget.description)}</string>`
  )
  .join('\n')}
</resources>
`;

export default withAndroidWidgetFiles;
