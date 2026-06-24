import { Platform } from 'react-native';

// The Android emulator reaches the host machine via 10.0.2.2; everything else
// talks to localhost. `EXPO_PUBLIC_API_PORT` selects the host port (parallel
// worktrees use a per-slot API port); `EXPO_PUBLIC_API_BASE_URL` overrides the
// whole URL for real devices.
const apiPort = process.env.EXPO_PUBLIC_API_PORT ?? '7002';
const defaultApiBaseUrl = Platform.OS === 'android' ? `http://10.0.2.2:${apiPort}` : `http://localhost:${apiPort}`;

/** Base URL of the @pkg/api server, shared by the auth, tRPC, and document-fetch clients. */
export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl).replace(/\/$/, '');
