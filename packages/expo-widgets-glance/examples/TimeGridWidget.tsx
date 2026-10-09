/**
 * A weekly time-grid widget — the "absolute positioning" pattern, done
 * without absolute positioning.
 *
 * A calendar/timetable design almost always specs each event by an absolute
 * pixel offset and height against a time axis. Neither `@expo/ui/swift-ui`'s
 * widget-safe subset nor this package's Glance renderer has anything
 * resembling "place this box at this exact (x, y)" — confirmed genuinely
 * absent on the Android side (there's no `Modifier.offset()` equivalent in
 * Jetpack Glance's public API at all, checked directly against the resolved
 * jar). This example reproduces the same visual result anyway: a day's
 * events are laid out as an ordinary `VStack` of alternating `Spacer`s
 * (sized to the gap before each event) and event blocks (sized to their
 * duration) — relative stacking that computes to the exact positions
 * absolute placement would have produced, using only `frame`'s fixed
 * width/height, which every widget renderer here already supports.
 *
 * Two more things worth calling out about this file specifically:
 * - Every helper (`minutesToHeight`, `hourGrid`, `dayColumn`, ...) is
 *   declared *inside* the widget function's own body, not at module scope.
 *   See AGENTS.md's "only the function's own source ships" rule — this
 *   isn't a style choice, a module-scope helper would resolve to nothing at
 *   render time.
 * - The background hour grid and the foreground event blocks are two
 *   separate `VStack`s stacked in one `ZStack`, not one combined tree. This
 *   is the standard way to layer a fixed background under content that's
 *   independently laid out — the two only need to agree on total height
 *   (`totalGridHeight`) to land correctly on top of each other.
 */
import { Divider, HStack, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { registerGlanceWidget } from 'expo-widgets-glance';

type Event = {
  /** Minutes after the grid's first hour (`START_HOUR`) that this event starts. */
  startMinutes: number;
  durationMinutes: number;
  title: string;
  color: string;
};

export type TimeGridWidgetProps = { eventsByDay: Event[][] };

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const DEFAULT_PROPS: TimeGridWidgetProps = {
  eventsByDay: [
    [
      { startMinutes: 60, durationMinutes: 75, title: 'Standup', color: '#FFA6A6' },
      { startMinutes: 300, durationMinutes: 50, title: 'Design review', color: '#FFE589' },
    ],
    [{ startMinutes: 120, durationMinutes: 90, title: 'Planning', color: '#94CDFA' }],
    [{ startMinutes: 90, durationMinutes: 60, title: '1:1', color: '#79DDDF' }],
    [],
    [{ startMinutes: 240, durationMinutes: 120, title: 'Ship it', color: '#C1ACFC' }],
  ],
};

const TimeGridWidget = (props: TimeGridWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const isDark = environment.colorScheme === 'dark';
  const colors = isDark
    ? { bg: '#1C1C1E', text: '#FFFFFF', textTertiary: '#98989F', blockText: '#333D4B' }
    : { bg: '#FFFFFF', text: '#191F28', textTertiary: '#8B95A1', blockText: '#333D4B' };

  // The grid's scale. A day can run later than `END_HOUR` — like a real
  // calendar view, something has to give in a fixed-size, non-scrolling
  // widget; events past the grid's range are simply cut off by the widget's
  // own fixed outer height, same as the rest of the grid past that point.
  const START_HOUR = 8;
  const END_HOUR = 18;
  const HOUR_HEIGHT = 28;
  const TIME_AXIS_WIDTH = 24;
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const totalGridHeight = hours.length * HOUR_HEIGHT;
  const minutesToHeight = (minutes: number) => (minutes / 60) * HOUR_HEIGHT;

  // The background: one thin divider at the top of every hour row, adding
  // up to exactly `totalGridHeight` — the reference the foreground layer
  // (below) has to land on top of and stay aligned with.
  const hourGrid = () => (
    <VStack spacing={0} modifiers={[frame({ maxWidth: Infinity })]}>
      {hours.map((hour) => (
        <VStack key={hour} spacing={0} modifiers={[frame({ maxWidth: Infinity, height: HOUR_HEIGHT })]}>
          <Divider />
        </VStack>
      ))}
    </VStack>
  );

  // The technique this file exists to demonstrate: a day's events as
  // alternating gap-`Spacer`s and blocks, computed from each event's
  // `startMinutes`/`durationMinutes` instead of an absolute position.
  const dayColumn = (events: Event[], dayIndex: number) => {
    const sorted = [...events].sort((a, b) => a.startMinutes - b.startMinutes);
    let cursorMinutes = 0;
    const children = [];
    for (let i = 0; i < sorted.length; i++) {
      const event = sorted[i];
      const startMinutes = Math.max(0, event.startMinutes);
      const gap = Math.max(0, startMinutes - cursorMinutes);
      if (gap > 0) {
        children.push(<Spacer key={`gap-${i}`} modifiers={[frame({ height: minutesToHeight(gap) })]} />);
      }
      children.push(
        <VStack
          key={`event-${i}`}
          alignment="leading"
          modifiers={[
            frame({ maxWidth: Infinity, height: minutesToHeight(event.durationMinutes) }),
            padding({ horizontal: 4, vertical: 2 }),
            background(event.color),
            cornerRadius(4),
          ]}
        >
          <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(colors.blockText)]}>
            {event.title}
          </Text>
        </VStack>
      );
      cursorMinutes = startMinutes + event.durationMinutes;
    }
    return (
      <ZStack key={dayIndex} alignment="top" modifiers={[frame({ maxWidth: Infinity, height: totalGridHeight })]}>
        {hourGrid()}
        <VStack spacing={0} modifiers={[frame({ maxWidth: Infinity })]}>
          {children}
        </VStack>
      </ZStack>
    );
  };

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[padding({ all: 16 }), containerBackground(colors.bg, 'widget')]}
    >
      <HStack spacing={0} alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
        {/* Invisible spacer matching the time-axis column's width below, so
            the day headers line up with their grid columns. */}
        <Rectangle modifiers={[frame({ width: TIME_AXIS_WIDTH, height: 1 })]} />
        {DAY_LABELS.map((label) => (
          <Text
            key={label}
            modifiers={[
              font({ size: 12, weight: 'medium' }),
              foregroundStyle(colors.textTertiary),
              frame({ maxWidth: Infinity, alignment: 'center' }),
            ]}
          >
            {label}
          </Text>
        ))}
      </HStack>
      <HStack spacing={4} alignment="top" modifiers={[frame({ maxWidth: Infinity })]}>
        <VStack spacing={0} modifiers={[frame({ width: TIME_AXIS_WIDTH })]}>
          {hours.map((hour) => (
            <VStack key={hour} spacing={0} modifiers={[frame({ height: HOUR_HEIGHT })]}>
              <Text modifiers={[font({ size: 9 }), foregroundStyle(colors.textTertiary)]}>{hour}</Text>
            </VStack>
          ))}
        </VStack>
        {props.eventsByDay.map((events, dayIndex) => dayColumn(events, dayIndex))}
      </HStack>
    </VStack>
  );
};

registerGlanceWidget('TimeGridWidget', TimeGridWidget); // Android — no-op on iOS
export default createWidget('TimeGridWidget', TimeGridWidget); // iOS
