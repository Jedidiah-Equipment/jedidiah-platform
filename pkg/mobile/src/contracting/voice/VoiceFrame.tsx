import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Rect } from 'react-native-svg';
import { StyledSvg } from '@/components/ui/svg';

// `rounded-xl` on native (NativeWind's rem is 14), held as a number because the sweep's path must match it.
const RADIUS = 10.5;
const STROKE = 2;
const LAP_MS = 2400;
// Two segments, each a fifth of the border, chase each other round.
const SEGMENT = 0.2;

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** The voice text area's frame: while `animating`, primary light runs round its border. */
export function VoiceFrame({ animating, children }: { animating: boolean; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const sweep = animating && !reducedMotion;
  const borderClass = animating ? (sweep ? 'border-primary/30' : 'border-primary') : 'border-border';
  return (
    <View onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}>
      <View className={`border bg-surface ${borderClass}`} style={{ borderRadius: RADIUS }}>
        {children}
      </View>
      {sweep && size ? <BorderSweep width={size.width} height={size.height} /> : null}
    </View>
  );
}

function BorderSweep({ width, height }: { width: number; height: number }) {
  const inset = STROKE / 2;
  const radius = RADIUS - inset;
  const pathWidth = width - STROKE;
  const pathHeight = height - STROKE;
  const perimeter = 2 * (pathWidth + pathHeight) - 8 * radius + 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: LAP_MS, easing: Easing.linear }), -1);
    return () => cancelAnimation(progress);
  }, [progress]);
  // A falling offset carries the dashes forward along the path; it stays positive for Android's dash phase.
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: perimeter * (1 - progress.value) }));
  const dash = perimeter * SEGMENT;
  const gap = perimeter / 2 - dash;
  return (
    <StyledSvg
      pointerEvents="none"
      className="text-primary"
      style={StyleSheet.absoluteFill}
      width={width}
      height={height}
    >
      <AnimatedRect
        x={inset}
        y={inset}
        width={pathWidth}
        height={pathHeight}
        rx={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={[dash, gap]}
        animatedProps={animatedProps}
      />
    </StyledSvg>
  );
}
