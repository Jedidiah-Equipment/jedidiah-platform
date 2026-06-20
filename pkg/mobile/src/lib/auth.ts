import { expoClient } from '@better-auth/expo/client';
import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
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
    // Mirror the server `admin` plugin so `session.user.role` is typed on device.
    adminClient(),
  ],
});

type SignInError = NonNullable<Awaited<ReturnType<typeof authClient.signIn.email>>['error']>;

export const useSession = authClient.useSession;
export const getCookie = authClient.getCookie;

export async function signIn(input: { email: string; password: string }): Promise<SignInResult> {
  try {
    const result = await authClient.signIn.email(input);

    if (result.error) {
      return { ok: false, message: getSignInErrorMessage(result.error) };
    }

    // Refresh the session store so the root auth guard redirects away from /login.
    await authClient.getSession();
    return { ok: true };
  } catch {
    return { ok: false, message: networkFailureMessage };
  }
}

export async function signOut() {
  await authClient.signOut();
}

function getSignInErrorMessage(error: SignInError): string {
  if (error.code === 'ACCOUNT_SIGN_IN_DISABLED') {
    return error.message || signInDisabledMessage;
  }

  if (error.code === 'INVALID_EMAIL_OR_PASSWORD' || error.status === 401) {
    return invalidCredentialsMessage;
  }

  // Surface any other server-provided message (e.g. unverified email); fall back when absent.
  return error.message || networkFailureMessage;
}
