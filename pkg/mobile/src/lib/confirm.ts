import { Alert } from 'react-native';

export type ConfirmOptions = { title: string; message?: string; confirmLabel: string; destructive?: boolean };

/** The system confirm sheet; resolves true only when the person chooses the confirming action. */
export function confirm({ title, message, confirmLabel, destructive = false }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
