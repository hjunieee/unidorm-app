// Adapted from expo-widgets (MIT, © 650 Industries, Inc.):
// node_modules/expo-widgets/plugin/src/android/resourceNames.ts

import { GlanceWidgetConfig } from './types';

const toAndroidResourceName = (name: string): string => {
  const resourceName = name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return /^[a-z]/.test(resourceName) ? resourceName : `widget_${resourceName}`;
};

export const getProviderClassName = (widget: GlanceWidgetConfig): string => {
  return `${widget.name}GlanceProvider`;
};

export const getWidgetInfoResourceName = (widget: GlanceWidgetConfig): string => {
  return `${toAndroidResourceName(widget.name)}_glance_info`;
};

export const getWidgetDisplayNameResourceName = (widget: GlanceWidgetConfig): string => {
  return `${toAndroidResourceName(widget.name)}_glance_display_name`;
};

export const getWidgetDescriptionResourceName = (widget: GlanceWidgetConfig): string => {
  return `${toAndroidResourceName(widget.name)}_glance_description`;
};

/** The `res/raw` JSON holding a widget's `configuration`, read by the configure activity and the renderer. */
export const getWidgetConfigurationResourceName = (widget: GlanceWidgetConfig): string => {
  return `${toAndroidResourceName(widget.name)}_glance_configuration`;
};
