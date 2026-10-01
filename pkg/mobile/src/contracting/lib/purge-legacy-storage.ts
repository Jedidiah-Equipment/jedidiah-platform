import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureSanitizedException } from '@/lib/observability';
import { removeLegacyReadingPhotos } from './legacy-reading-photos';

// The retired reading queue and its offline copies of the fleet and Jobs (ADR 0021). The Machines list's
// remembered filter and sort live under `contracting:machines:` and stay.
const LEGACY_PREFIXES = ['contracting:readings:', 'contracting:fleet:', 'contracting:jobs:'] as const;
let started = false;

/** Once per app start: drops what earlier builds kept on the phone for offline capture, unread. */
export async function purgeLegacyContractingStorage(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
      LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    if (keys.length) await AsyncStorage.removeMany(keys);
    await removeLegacyReadingPhotos();
  } catch (error) {
    captureSanitizedException(error, 'Legacy Contracting storage purge failed', { source: 'legacy_purge' });
  }
}
