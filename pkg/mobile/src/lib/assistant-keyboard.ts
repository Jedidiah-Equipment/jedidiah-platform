import { useEffect, useState } from 'react';
import { Keyboard, type KeyboardEvent, Platform } from 'react-native';

export function assistantKeyboardBottomPadding(
  keyboardHeight: number,
  safeAreaBottom: number,
  platform = Platform.OS,
): number {
  const coveredSafeArea = platform === 'ios' ? safeAreaBottom : 0;
  return Math.max(keyboardHeight - coveredSafeArea, 0);
}

export function useAssistantKeyboardBottomPadding(safeAreaBottom: number): number {
  const [bottomPadding, setBottomPadding] = useState(() =>
    assistantKeyboardBottomPadding(Keyboard.metrics()?.height ?? 0, safeAreaBottom),
  );

  useEffect(() => {
    const updatePadding = (event: KeyboardEvent) => {
      // Native keyboard avoidance is unreliable in the iOS modal and Android's
      // edge-to-edge window, so apply the reported keyboard frame directly.
      Keyboard.scheduleLayoutAnimation(event);
      setBottomPadding(assistantKeyboardBottomPadding(event.endCoordinates.height, safeAreaBottom));
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
