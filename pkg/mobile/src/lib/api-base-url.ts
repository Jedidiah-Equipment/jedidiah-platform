import { Platform } from 'react-native';

// The Android emulator reaches the host machine via 10.0.2.2; everything else
// talks to localhost. `EXPO_PUBLIC_API_BASE_URL` overrides both for real devices.
const defaultApiBaseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:7002' : 'http://localhost:7002';

/** Base URL of the @pkg/api server, shared by the auth, tRPC, and document-fetch clients. */
export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl).replace(/\/$/, '');
