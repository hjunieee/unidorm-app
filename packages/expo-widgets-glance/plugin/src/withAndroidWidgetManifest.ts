// Adapted from expo-widgets (MIT, © 650 Industries, Inc.):
// node_modules/expo-widgets/plugin/src/android/withAndroidWidgetManifest.ts
//
// Registers one <receiver> per widget, same shape expo-widgets' own Android
// plugin would produce for the same widget — but pointed at our generated
// `${name}GlanceProvider` class (see resourceNames.ts) instead of upstream's
// `${name}Provider`, so the two plugins can never collide even if a widget is
// accidentally left wired to both.

import { AndroidConfig, ConfigPlugin, withAndroidManifest } from 'expo/config-plugins';

import {
  getProviderClassName,
  getWidgetConfigurationResourceName,
  getWidgetDisplayNameResourceName,
  getWidgetInfoResourceName,
} from './resourceNames';
import { GlanceWidgetConfig } from './types';

const GLANCE_INTERACTION_ACTION = 'expo.modules.widgetsglance.ACTION_WIDGET_INTERACTION';
const GLANCE_NAME_METADATA = 'expo.modules.widgetsglance.NAME';
/** Must match `WidgetConfigurationSpec.METADATA`. */
const GLANCE_CONFIGURATION_METADATA = 'expo.modules.widgetsglance.CONFIGURATION';

type ManifestReceiver = {
  $: {
    'android:name': string;
    'android:exported'?: 'true' | 'false';
    'android:label'?: string;
    [key: string]: string | undefined;
  };
  'intent-filter'?: { action?: { $: { 'android:name': string } }[] }[];
  'meta-data'?: { $: { 'android:name': string; 'android:value'?: string; 'android:resource'?: string } }[];
};

const createWidgetReceiver = (widget: GlanceWidgetConfig): ManifestReceiver => ({
  $: {
    'android:name': `.${getProviderClassName(widget)}`,
    'android:exported': 'true',
    'android:label': `@string/${getWidgetDisplayNameResourceName(widget)}`,
  },
  'intent-filter': [
    {
      action: [
        { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
        { $: { 'android:name': GLANCE_INTERACTION_ACTION } },
      ],
    },
  ],
  'meta-data': [
    {
      $: {
        'android:name': 'android.appwidget.provider',
        'android:resource': `@xml/${getWidgetInfoResourceName(widget)}`,
      },
    },
    { $: { 'android:name': GLANCE_NAME_METADATA, 'android:value': widget.name } },
    ...(widget.configuration
      ? [
          {
            $: {
              'android:name': GLANCE_CONFIGURATION_METADATA,
              'android:resource': `@raw/${getWidgetConfigurationResourceName(widget)}`,
            },
          },
        ]
      : []),
  ],
});

const withAndroidWidgetManifest: ConfigPlugin<GlanceWidgetConfig[]> = (config, widgets) => {
  return withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const receivers = (mainApplication.receiver ?? []) as ManifestReceiver[];
    const isNotGlanceReceiver = (receiver: ManifestReceiver) =>
      !receiver['meta-data']?.some((metaData) => metaData.$['android:name'] === GLANCE_NAME_METADATA);

    mainApplication.receiver = [
      ...receivers.filter(isNotGlanceReceiver),
      ...widgets.map(createWidgetReceiver),
    ];

    return config;
  });
};

export default withAndroidWidgetManifest;
