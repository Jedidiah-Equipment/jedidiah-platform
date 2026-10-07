import * as Location from 'expo-location';

const LOCATION_TIMEOUT_MS = 8_000;

/** Where the phone is, roughly, or null: a denied permission, no fix in time, or any failure says nothing. */
export async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS));
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      timeout,
    ]);
    return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null;
  } catch {
    return null;
  }
}
