import { IconX } from '@tabler/icons-react-native';
import { type ComponentRef, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, type GestureResponderEvent, PanResponder, Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import type { AuthedFileSource } from '@/lib/authed-file-source';
import {
  containedSize,
  distance,
  doubleTap,
  midpoint,
  type Point,
  pan,
  pinch,
  type Size,
  settle,
  UNZOOMED,
  type Zoom,
} from './image-zoom';

const TAP_SLOP = 10;
const TAP_MS = 250;
const DOUBLE_TAP_MS = 300;
const SETTLE_MS = 180;

/**
 * The one full-screen photo viewer: pinch to zoom, drag a zoomed photo around, double-tap to zoom in or out.
 * Open while `source` is set; a local photo passes `{ kind: 'ready', uri }`.
 */
export function ImageViewer({
  label,
  onClose,
  source,
}: {
  /** Names the photo for assistive tech, e.g. `Breakdown photo 2`. */
  label: string;
  onClose: () => void;
  source: AuthedFileSource | null;
}) {
  return (
    <ThemedModal backdropLabel="Close photo" open={source !== null} onClose={onClose}>
      <View className="w-full flex-1 overflow-hidden rounded-2xl bg-black">
        {source?.kind === 'ready' ? (
          <ZoomableImage key={source.uri} label={label} uri={source.uri} />
        ) : source ? (
          <View className="flex-1 items-center justify-center">
            {source.kind === 'loading' ? (
              <ActivityIndicator className="text-white" />
            ) : (
              <Text className="text-sm text-white">This photo couldn’t be loaded.</Text>
            )}
          </View>
        ) : null}
        <Pressable
          accessibilityLabel="Close photo"
          accessibilityRole="button"
          className="absolute right-3 top-3 h-10 w-10 items-center justify-center rounded-full bg-black/60"
          onPress={onClose}
        >
          <Icon className="text-white" icon={IconX} size={20} />
        </Pressable>
      </View>
    </ThemedModal>
  );
}

function ZoomableImage({ label, uri }: { label: string; uri: string }) {
  const frameRef = useRef<ComponentRef<typeof View>>(null);
  const frame = useRef({ size: { width: 0, height: 0 } as Size, origin: { x: 0, y: 0 } as Point });
  const imageSize = useRef<Size | null>(null);
  const zoom = useRef<Zoom>(UNZOOMED);
  const values = useRef({ scale: new Animated.Value(1), x: new Animated.Value(0), y: new Animated.Value(0) }).current;

  const responder = useMemo(() => {
    let gesture: { start: Zoom; touches: Point[] } | null = null;
    let tap: { at: Point; time: number; tappable: boolean } | null = null;
    let lastTap: { at: Point; time: number } | null = null;

    const content = () => containedSize(frame.current.size, imageSize.current);
    const touches = (event: GestureResponderEvent): Point[] => {
      const { origin, size } = frame.current;
      return event.nativeEvent.touches.map((touch) => ({
        x: touch.pageX - origin.x - size.width / 2,
        y: touch.pageY - origin.y - size.height / 2,
      }));
    };
    const show = (next: Zoom) => {
      zoom.current = next;
      values.scale.setValue(next.scale);
      values.x.setValue(next.x);
      values.y.setValue(next.y);
    };
    const animateTo = (next: Zoom) => {
      zoom.current = next;
      Animated.parallel(
        (['scale', 'x', 'y'] as const).map((key) =>
          Animated.timing(values[key], { toValue: next[key], duration: SETTLE_MS, useNativeDriver: true }),
        ),
      ).start();
    };
    const release = () => {
      gesture = null;
      const ended = tap;
      tap = null;
      if (ended?.tappable && Date.now() - ended.time < TAP_MS) {
        if (lastTap && ended.time - lastTap.time < DOUBLE_TAP_MS && distance(lastTap.at, ended.at) < TAP_SLOP * 3) {
          lastTap = null;
          animateTo(doubleTap(zoom.current, ended.at, frame.current.size, content()));
          return;
        }
        lastTap = { at: ended.at, time: ended.time };
      }
      animateTo(settle(zoom.current, frame.current.size, content()));
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => {
        // A touch landing mid-settle takes over from where that settle was heading.
        for (const value of Object.values(values)) value.stopAnimation();
        show(zoom.current);
        const now = touches(event);
        gesture = { start: zoom.current, touches: now };
        tap = now[0] ? { at: now[0], time: Date.now(), tappable: now.length === 1 } : null;
      },
      onPanResponderMove: (event) => {
        const now = touches(event);
        if (!gesture || now.length !== gesture.touches.length) {
          // A finger joined or lifted: carry on from here rather than jump.
          gesture = { start: zoom.current, touches: now };
          if (tap) tap.tappable = false;
          return;
        }
        const [first, second] = now;
        const [startFirst, startSecond] = gesture.touches;
        if (!first || !startFirst) return;
        if (tap && distance(first, tap.at) > TAP_SLOP) tap.tappable = false;
        if (second && startSecond) {
          const ratio = distance(first, second) / Math.max(1, distance(startFirst, startSecond));
          show(pinch(gesture.start, midpoint(startFirst, startSecond), midpoint(first, second), ratio));
        } else if (gesture.start.scale > 1) {
          show(pan(gesture.start, first.x - startFirst.x, first.y - startFirst.y));
        }
      },
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
    });
  }, [values]);

  return (
    <View
      ref={frameRef}
      className="flex-1"
      onLayout={({ nativeEvent }) => {
        frame.current.size = { width: nativeEvent.layout.width, height: nativeEvent.layout.height };
        frameRef.current?.measure((_x, _y, _width, _height, pageX, pageY) => {
          frame.current.origin = { x: pageX, y: pageY };
        });
      }}
      {...responder.panHandlers}
    >
      <Animated.Image
        accessibilityHint="Pinch or double-tap to zoom"
        accessibilityLabel={label}
        onLoad={({ nativeEvent }) => {
          const { width, height } = nativeEvent.source;
          imageSize.current = { width, height };
        }}
        resizeMode="contain"
        source={{ uri }}
        // Explicit dimensions avoid react-native-web falling back to the image's intrinsic size.
        style={{
          height: '100%',
          width: '100%',
          transform: [{ translateX: values.x }, { translateY: values.y }, { scale: values.scale }],
        }}
      />
    </View>
  );
}
