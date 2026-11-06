import { formatNumber } from '@pkg/domain';
import { IconX } from '@tabler/icons-react-native';
import { type ComponentRef, useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  type GestureResponderEvent,
  PanResponder,
  Pressable,
  View,
} from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import type { AuthedFileSource } from '@/lib/authed-file-source';
import {
  containedSize,
  type Drag,
  distance,
  doubleTap,
  midpoint,
  type Point,
  pan,
  pinch,
  type Size,
  settle,
  swipeOffset,
  swipeTarget,
  UNZOOMED,
  type Zoom,
} from './image-zoom';

const TAP_SLOP = 10;
const TAP_MS = 250;
const DOUBLE_TAP_MS = 300;
const SETTLE_MS = 180;

export type ViewerPhoto = {
  /** Stays with the photo while the set around it changes, e.g. its id. */
  key: string;
  /** Names the photo for assistive tech, e.g. `Breakdown photo 2`. */
  label: string;
  /** A local photo passes `{ kind: 'ready', uri }`. */
  source: AuthedFileSource;
};

/**
 * The one full-screen photo viewer: pinch to zoom, drag a zoomed photo around, double-tap to zoom in or out, and
 * swipe an unzoomed photo sideways to the next or previous one in `photos`. Open while `index` names a photo.
 */
export function ImageViewer({
  index,
  onClose,
  onIndexChange,
  photos,
}: {
  index: number | null;
  onClose: () => void;
  /** Turns to another photo; a set of one never calls it. */
  onIndexChange?: (index: number) => void;
  photos: readonly ViewerPhoto[];
}) {
  const photo = index === null ? undefined : photos[index];
  const turnTo = (next: number) => {
    onIndexChange?.(next);
    const label = photos[next]?.label;
    if (label) AccessibilityInfo.announceForAccessibility(label);
  };
  return (
    <ThemedModal backdropLabel="Close photo" open={photo !== undefined} onClose={onClose}>
      <View className="w-full flex-1 overflow-hidden rounded-2xl bg-black">
        {photo && index !== null ? (
          <>
            {/* Outside the per-photo remount, so a screen reader keeps its place when the photo turns. */}
            <View
              accessible
              accessibilityActions={[
                ...(index > 0 ? [TURN_ACTIONS.previous] : []),
                ...(index < photos.length - 1 ? [TURN_ACTIONS.next] : []),
              ]}
              accessibilityHint={photo.source.kind === 'ready' ? 'Pinch or double-tap to zoom' : undefined}
              accessibilityLabel={photo.label}
              accessibilityRole="image"
              accessibilityState={{ busy: photo.source.kind === 'loading' }}
              className="flex-1"
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === 'next') turnTo(index + 1);
                if (nativeEvent.actionName === 'previous') turnTo(index - 1);
              }}
            >
              <ZoomablePhoto
                key={photo.key}
                count={photos.length}
                index={index}
                source={photo.source}
                onTurn={(next) => onIndexChange?.(next)}
              />
            </View>
            {photos.length > 1 ? (
              <View
                className="absolute left-3 top-3 h-10 justify-center rounded-full bg-black/60 px-4"
                pointerEvents="none"
              >
                <Text className="text-sm text-white">
                  {formatNumber(index + 1)} of {formatNumber(photos.length)}
                </Text>
              </View>
            ) : null}
          </>
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

const TURN_ACTIONS = {
  next: { name: 'next', label: 'Next photo' },
  previous: { name: 'previous', label: 'Previous photo' },
};

function ZoomablePhoto({
  count,
  index,
  onTurn,
  source,
}: {
  count: number;
  index: number;
  onTurn: (index: number) => void;
  source: AuthedFileSource;
}) {
  const frameRef = useRef<ComponentRef<typeof View>>(null);
  const frame = useRef({ size: { width: 0, height: 0 } as Size, origin: { x: 0, y: 0 } as Point });
  const imageSize = useRef<Size | null>(null);
  const zoom = useRef<Zoom>(UNZOOMED);
  const values = useRef({ scale: new Animated.Value(1), x: new Animated.Value(0), y: new Animated.Value(0) }).current;
  // The responder outlives renders, so it reads where it is in the set from here.
  const latest = useRef({ count, index, onTurn, zoomable: false });
  latest.current = { count, index, onTurn, zoomable: source.kind === 'ready' };

  // A swipe still sliding out when the viewer closes must not turn, and so reopen, it.
  useEffect(
    () => () => {
      for (const value of Object.values(values)) value.stopAnimation();
    },
    [values],
  );

  const responder = useMemo(() => {
    let gesture: { start: Zoom; touches: Point[] } | null = null;
    let tap: { at: Point; time: number; tappable: boolean } | null = null;
    let lastTap: { at: Point; time: number } | null = null;
    // A drag that began with one finger, and has had only that finger since.
    let swipe: { start: Zoom } | null = null;
    // The photo a swipe is sliding out toward.
    let turning: number | null = null;

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
    const turn = (next: number) => {
      turning = next;
      const width = frame.current.size.width;
      Animated.timing(values.x, {
        toValue: next > latest.current.index ? -width : width,
        duration: SETTLE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) latest.current.onTurn(next);
      });
    };
    const release = (_event: GestureResponderEvent, drag: Drag) => {
      if (turning !== null) return;
      gesture = null;
      const ended = tap;
      const swiped = swipe;
      tap = null;
      swipe = null;
      if (ended?.tappable && Date.now() - ended.time < TAP_MS) {
        if (
          latest.current.zoomable &&
          lastTap &&
          ended.time - lastTap.time < DOUBLE_TAP_MS &&
          distance(lastTap.at, ended.at) < TAP_SLOP * 3
        ) {
          lastTap = null;
          animateTo(doubleTap(zoom.current, ended.at, frame.current.size, content()));
          return;
        }
        lastTap = { at: ended.at, time: ended.time };
      }
      if (swiped) {
        const { count, index } = latest.current;
        const next = swipeTarget(swiped.start, drag, frame.current.size.width, index, count);
        if (next !== index) {
          turn(next);
          return;
        }
      }
      animateTo(settle(zoom.current, frame.current.size, content()));
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => {
        // A swipe still sliding out finishes at once rather than being lost to a quick next swipe.
        if (turning !== null) return latest.current.onTurn(turning);
        // A touch landing mid-settle takes over from where that settle was heading.
        for (const value of Object.values(values)) value.stopAnimation();
        show(zoom.current);
        const now = touches(event);
        gesture = { start: zoom.current, touches: now };
        tap = now[0] ? { at: now[0], time: Date.now(), tappable: now.length === 1 } : null;
        swipe = now.length === 1 ? { start: zoom.current } : null;
      },
      onPanResponderMove: (event, drag) => {
        if (turning !== null) return;
        const now = touches(event);
        if (!gesture || now.length !== gesture.touches.length) {
          // A finger joined or lifted: carry on from here rather than jump.
          gesture = { start: zoom.current, touches: now };
          if (tap) tap.tappable = false;
          swipe = null;
          return;
        }
        const [first, second] = now;
        const [startFirst, startSecond] = gesture.touches;
        if (!first || !startFirst) return;
        if (tap && distance(first, tap.at) > TAP_SLOP) tap.tappable = false;
        if (second && startSecond) {
          if (!latest.current.zoomable) return;
          const ratio = distance(first, second) / Math.max(1, distance(startFirst, startSecond));
          show(pinch(gesture.start, midpoint(startFirst, startSecond), midpoint(first, second), ratio));
        } else if (gesture.start.scale > 1) {
          show(pan(gesture.start, first.x - startFirst.x, first.y - startFirst.y));
        } else if (swipe) {
          show({ ...UNZOOMED, x: swipeOffset(drag.dx, latest.current.index, latest.current.count) });
        }
      },
      onPanResponderRelease: release,
      onPanResponderTerminate: (event, drag) => {
        // A gesture taken away settles where it is; only a finger lifted turns the photo.
        swipe = null;
        release(event, drag);
      },
    });
  }, [values]);

  const transform = [{ translateX: values.x }, { translateY: values.y }, { scale: values.scale }];

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
      {source.kind === 'ready' ? (
        <Animated.Image
          onLoad={({ nativeEvent }) => {
            const { width, height } = nativeEvent.source;
            imageSize.current = { width, height };
          }}
          resizeMode="contain"
          source={{ uri: source.uri }}
          // Explicit dimensions avoid react-native-web falling back to the image's intrinsic size.
          style={{ height: '100%', width: '100%', transform }}
        />
      ) : (
        <Animated.View className="flex-1 items-center justify-center" style={{ transform }}>
          {source.kind === 'loading' ? (
            <ActivityIndicator className="text-white" />
          ) : (
            <Text className="text-sm text-white">This photo couldn’t be loaded.</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}
