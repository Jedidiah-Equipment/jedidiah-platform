import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { theme } from '../src/theme';

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: theme.colors.background },
          headerShown: false,
        }}
      />
      <StatusBar style="dark" />
    </>
  );
}
