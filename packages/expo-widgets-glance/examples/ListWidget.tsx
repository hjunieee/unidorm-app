/**
 * A more realistic widget: multiple states, a list built with `.map()`, and
 * a highlighted row with a left accent bar — the "border-box decoration vs.
 * content-box padding" pattern from docs/ARCHITECTURE.md, spelled out in
 * full here since it isn't obvious the first time.
 *
 * The one Android/Glance-specific caveat this example works around: there's
 * no way on this renderer to make the accent bar auto-fill the row's real
 * height (see docs/ARCHITECTURE.md's "More bugs found..." section) — so its
 * height is a hand-measured constant, not something derived from layout.
 * That's a real, documented platform limitation, not an oversight here.
 */
import { HStack, Rectangle, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { registerGlanceWidget } from 'expo-widgets-glance';

type Item = { label: string; detail: string; highlighted?: boolean };

export type ListWidgetProps =
  | { status: 'normal'; heading: string; items: Item[] }
  | { status: 'empty'; heading: string };

export const DEFAULT_PROPS: ListWidgetProps = {
  status: 'normal',
  heading: 'Today',
  items: [
    { label: 'Stand-up', detail: '09:00', highlighted: true },
    { label: 'Design review', detail: '11:30' },
    { label: 'Ship it', detail: '16:00' },
  ],
};

// Hand-measured to match this row's own font size + padding — see the doc
// comment above and docs/ARCHITECTURE.md for why this can't be computed.
const ROW_HEIGHT = 28;

const ListWidget = (props: ListWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const isDark = environment.colorScheme === 'dark';
  const colors = isDark
    ? {
        bg: '#1C1C1E',
        rowHighlightBg: '#13223A',
        text: '#E5E5EA',
        detail: '#98989F',
        accent: '#4C8DFF',
      }
    : {
        bg: '#FFFFFF',
        rowHighlightBg: '#EFF6FF',
        text: '#333D4B',
        detail: '#8B95A1',
        accent: '#0061FF',
      };

  const row = (item: Item, key: number) => (
    // Two nesting tiers, deliberately: the OUTER row is the row's true
    // edge — unpadded, so the accent bar sits flush against it (a
    // border-box decoration). The INNER row owns the padding around the
    // actual content (content-box). Putting the bar and the padding in the
    // same container insets the bar along with everything else, which is
    // usually not what a left-accent design wants.
    <HStack key={key} spacing={0} alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
      {item.highlighted && (
        <Rectangle modifiers={[frame({ width: 3, height: ROW_HEIGHT }), background(colors.accent)]} />
      )}
      <HStack
        spacing={8}
        alignment="center"
        modifiers={[
          frame({ maxWidth: Infinity }),
          padding({ horizontal: 8, vertical: 4 }),
          ...(item.highlighted ? [background(colors.rowHighlightBg)] : []),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 14, weight: 'medium' }),
            foregroundStyle(colors.text),
            frame({ maxWidth: Infinity, alignment: 'leading' }),
          ]}
        >
          {item.label}
        </Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(colors.detail)]}>{item.detail}</Text>
      </HStack>
    </HStack>
  );

  let content;
  switch (props.status) {
    case 'normal':
      content = (
        <>
          <Text modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle(colors.detail)]}>
            {props.heading}
          </Text>
          <VStack spacing={4} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            {props.items.map((item, index) => row(item, index))}
          </VStack>
        </>
      );
      break;
    case 'empty':
      content = (
        <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle(colors.text)]}>
          Nothing here yet
        </Text>
      );
      break;
  }

  return (
    <VStack
      alignment="leading"
      spacing={12}
      modifiers={[padding({ all: 16 }), containerBackground(colors.bg, 'widget')]}
    >
      {content}
    </VStack>
  );
};

registerGlanceWidget('ListWidget', ListWidget); // Android — no-op on iOS
export default createWidget('ListWidget', ListWidget); // iOS
