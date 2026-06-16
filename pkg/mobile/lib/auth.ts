import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';
import { Platform } from 'react-native';

const defaultApiBaseUrl = Platform.OS === 'android' ? 'http://10.0.2.2:7002' : 'http://localhost:7002';
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiBaseUrl;
const authBaseUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/auth`;
const invalidCredentialsMessage = 'Email or password is incorrect.';
const networkFailureMessage = 'Unable to reach the API. Check your connection and try again.';
const signInDisabledMessage = 'This account is not enabled for sign-in.';

type SignInResult = { ok: true } | { ok: false; message: string };

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

export async function signIn(input: { email: string; password: string }): Promise<SignInResult> {
  try {
    const result = await authClient.signIn.email(input);

    if (result.error) {
      return { ok: false, message: getSignInErrorMessage(result.error) };
    }

    await authClient.getSession();
    return { ok: true };
  } catch {
    return { ok: false, message: networkFailureMessage };
  }
}

export async function signOut() {
  await authClient.signOut();
}

function getSignInErrorMessage(error: unknown) {
  const code = getStringProperty(error, 'code');
  const status = getNumberProperty(error, 'status');
  const message = getStringProperty(error, 'message');

  if (code === 'ACCOUNT_SIGN_IN_DISABLED') {
    return message || signInDisabledMessage;
  }

  if (code === 'INVALID_EMAIL_OR_PASSWORD' || status === 401) {
    return invalidCredentialsMessage;
  }

  return networkFailureMessage;
}

function getStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'string' ? property : null;
}

function getNumberProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) {
    return null;
  }

  const property = (value as Record<string, unknown>)[key];
  return typeof property === 'number' ? property : null;
}
