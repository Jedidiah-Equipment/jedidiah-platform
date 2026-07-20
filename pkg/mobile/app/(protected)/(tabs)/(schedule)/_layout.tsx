import { Stack } from 'expo-router';

/** Schedule stack: the existing Board, Bay, and Job routes under the Schedule tab. */
export default function ScheduleLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
