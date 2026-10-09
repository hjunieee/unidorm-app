/**
 * The minimum viable widget: one state, no data fetching. Good starting
 * point for wiring the plugin + build up before writing anything real.
 */
import { Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { registerGlanceWidget } from 'expo-widgets-glance';

export type SimpleWidgetProps = { title: string; subtitle: string };

export const DEFAULT_PROPS: SimpleWidgetProps = {
  title: 'Hello',
  subtitle: 'from expo-widgets-glance',
};

const SimpleWidget = (props: SimpleWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  // Dark-mode support: `environment.colorScheme` is the only thing this
  // function gets to branch on for theming — there's no access to the host
  // app's own theme context (see AGENTS.md's "only the function's own
  // source" rule for why).
  const isDark = environment.colorScheme === 'dark';
  const colors = isDark
    ? { bg: '#1C1C1E', title: '#FFFFFF', subtitle: '#98989F' }
    : { bg: '#FFFFFF', title: '#191F28', subtitle: '#8B95A1' };

  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[padding({ all: 16 }), containerBackground(colors.bg, 'widget')]}
    >
      <Text modifiers={[font({ size: 20, weight: 'semibold' }), foregroundStyle(colors.title)]}>
        {props.title}
      </Text>
      <Text modifiers={[font({ size: 14 }), foregroundStyle(colors.subtitle)]}>
        {props.subtitle}
      </Text>
    </VStack>
  );
};

registerGlanceWidget('SimpleWidget', SimpleWidget); // Android — no-op on iOS
export default createWidget('SimpleWidget', SimpleWidget); // iOS
