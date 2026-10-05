import { useEffect, useState } from 'react';
import { Keyboard, type KeyboardEvent, Platform } from 'react-native';

export function keyboardBottomPadding(keyboardHeight: number, safeAreaBottom: number, platform = Platform.OS): number {
  const coveredSafeArea = platform === 'ios' ? safeAreaBottom : 0;
  return Math.max(keyboardHeight - coveredSafeArea, 0);
}

export function keyboardInitialBottomPadding(safeAreaBottom: number, platform = Platform.OS): number {
  if (platform === 'web') return 0;
  return keyboardBottomPadding(Keyboard.metrics()?.height ?? 0, safeAreaBottom, platform);
}

export function useKeyboardBottomPadding(safeAreaBottom: number): number {
  const [bottomPadding, setBottomPadding] = useState(() => keyboardInitialBottomPadding(safeAreaBottom));

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const updatePadding = (event: KeyboardEvent) => {
      // Native keyboard avoidance is unreliable in an iOS modal and in Android's
      // edge-to-edge window, so apply the reported keyboard frame directly.
      Keyboard.scheduleLayoutAnimation(event);
      setBottomPadding(keyboardBottomPadding(event.endCoordinates.height, safeAreaBottom));
    };
    const clearPadding = (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setBottomPadding(0);
    };
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      updatePadding,
    );
    const frameSubscription =
      Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillChangeFrame', updatePadding) : null;
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      clearPadding,
    );

    return () => {
      showSubscription.remove();
      frameSubscription?.remove();
      hideSubscription.remove();
    };
  }, [safeAreaBottom]);

  return bottomPadding;
}
