import { Stack } from 'expo-router';

/** Product catalog stack; detail routes can be added without changing the tab shell. */
export default function ProductsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
