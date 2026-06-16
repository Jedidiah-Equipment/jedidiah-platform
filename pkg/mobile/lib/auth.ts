import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:7002';
const authBaseUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/auth`;

const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [
    expoClient({
      scheme: 'jedidiahops',
      storagePrefix: 'jedidiahops',
      storage: SecureStore,
    }),
  ],
});

export const useSession = authClient.useSession;
export const getCookie = authClient.getCookie;

export async function signIn(input: { email: string; password: string }) {
  const result = await authClient.signIn.email(input);

  if (!result.error) {
    await authClient.getSession();
  }

  return result;
}

export async function signOut() {
  await authClient.signOut();
}
