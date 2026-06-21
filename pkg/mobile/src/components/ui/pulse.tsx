import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/** A muted block that gently pulses opacity — the skeleton-loading primitive. */
export function Pulse({ className }: { className: string }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [opacity]);

  return <Animated.View className={`bg-muted ${className}`} style={{ opacity }} />;
}
