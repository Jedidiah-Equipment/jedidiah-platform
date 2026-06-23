import { expoClient } from '@better-auth/expo/client';
import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiBaseUrl } from './api-base-url';
import { resolveRuntimeScheme } from './runtime-app-identity';

const authBaseUrl = `${apiBaseUrl}/api/auth`;
const authScheme = resolveRuntimeScheme(Constants.expoConfig);
const invalidCredentialsMessage = 'Email or password is incorrect.';
const networkFailureMessage = 'Unable to reach the API. Check your connection and try again.';
const signInDisabledMessage = 'This account is not enabled for sign-in.';

type SignInResult = { ok: true } | { ok: false; message: string };

const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [
    expoClient({
      scheme: authScheme,
      storagePrefix: authScheme,
      storage: SecureStore,
    }),
    // Mirror the server `admin` plugin so `session.user.role` is typed on device.
    adminClient(),
  ],
});

type SignInError = NonNullable<Awaited<ReturnType<typeof authClient.signIn.email>>['error']>;

export const useSession = authClient.useSession;

/**
 * Session cookie value for a manual `Cookie` header on native, where there is no
 * cookie jar. Returns null on web: the browser attaches the cookie itself (via
 * `credentials: 'include'`), and better-auth's SecureStore-backed `getCookie()`
 * reads storage synchronously, which `react-native-web` does not support.
 */
export function sessionCookieHeader(): string | null {
  if (Platform.OS === 'web') {
    return null;
  }

  return authClient.getCookie() || null;
}

/** A resolved (non-null) session, as guaranteed inside the protected route tree. */
export type AuthSession = NonNullable<ReturnType<typeof useSession>['data']>;

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
