import { Stack } from 'expo-router';

/** Quote stack; list and detail routes share the permission-gated Quotes tab. */
export default function QuotesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
