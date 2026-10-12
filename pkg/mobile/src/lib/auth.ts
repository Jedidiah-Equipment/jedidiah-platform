import { expoClient } from '@better-auth/expo/client';
import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiBaseUrl } from './api-base-url';
import { addBreadcrumb, captureEvent, identifyObservabilityUser, resetObservability } from './observability';
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
    // Mirror the server user fields that the protected mobile tree reads from the session.
    inferAdditionalFields({
      user: {
        assistantEnabled: { type: 'boolean' },
        contractingRole: { type: 'string' },
      },
    }),
  ],
});

type SignInError = NonNullable<Awaited<ReturnType<typeof authClient.signIn.email>>['error']>;

export const useSession = authClient.useSession;

/**
 * Session cookie value for a manual `Cookie` header on native, where there is no
 * cookie jar. Returns null on web: the browser attaches the cookie itself via
 * `credentials: 'include'`, and SecureStore has no web backing store to read.
 *
 * Async since better-auth 1.7 — the Expo client moved to SecureStore's async API.
 */
export async function sessionCookieHeader(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  return (await authClient.getCookie()) || null;
}

/** A resolved (non-null) session, as guaranteed inside the protected route tree. */
export type AuthSession = NonNullable<ReturnType<typeof useSession>['data']>;

export async function signIn(input: { email: string; password: string }): Promise<SignInResult> {
  const startedAt = Date.now();
  try {
    const result = await authClient.signIn.email(input);

    if (result.error) {
      recordAuthRequest('/api/auth/sign-in/email', result.error.status ?? 400, startedAt);
      captureEvent('sign in failed', { reason: signInErrorCategory(result.error) });
      return { ok: false, message: getSignInErrorMessage(result.error) };
    }

    // Refresh the session store so the root auth guard redirects away from /login.
    const resolved = await authClient.getSession();
    recordAuthRequest('/api/auth/sign-in/email', 200, startedAt);
    if (resolved.data?.user.id) identifyObservabilityUser(resolved.data.user.id);
    captureEvent('signed in');
    return { ok: true };
  } catch {
    recordAuthRequest('/api/auth/sign-in/email', 0, startedAt);
    captureEvent('sign in failed', { reason: 'network' });
    return { ok: false, message: networkFailureMessage };
  }
}

export async function signOut(reason: 'ineligible session' | 'signed out' = 'signed out') {
  const startedAt = Date.now();
  let failureRecorded = false;
  try {
    const result = await authClient.signOut();
    if (result.error) {
      recordAuthRequest('/api/auth/sign-out', result.error.status ?? 400, startedAt);
      failureRecorded = true;
      throw result.error;
    }
    recordAuthRequest('/api/auth/sign-out', 200, startedAt);
    captureEvent('signed out', { reason });
    resetObservability(reason);
  } catch (error) {
    if (!failureRecorded) recordAuthRequest('/api/auth/sign-out', 0, startedAt);
    throw error;
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const startedAt = Date.now();
  try {
    await authClient.requestPasswordReset({ email });
    recordAuthRequest('/api/auth/request-password-reset', 200, startedAt);
    captureEvent('password reset requested');
  } catch (error) {
    recordAuthRequest('/api/auth/request-password-reset', 0, startedAt);
    throw error;
  }
}

function recordAuthRequest(route: string, status: number, startedAt: number): void {
  const outcome = status === 0 ? 'auth request failed' : 'auth request';
  addAuthBreadcrumb(outcome, route, status, startedAt);
}

function addAuthBreadcrumb(message: string, route: string, status: number, startedAt: number): void {
  addBreadcrumb('network', message, {
    durationMs: Date.now() - startedAt,
    method: 'POST',
    route,
    status,
  });
}

function signInErrorCategory(error: SignInError): string {
  if (error.code === 'ACCOUNT_SIGN_IN_DISABLED') return 'disabled';
  if (error.code === 'INVALID_EMAIL_OR_PASSWORD' || error.status === 401) return 'credentials';
  return error.status && error.status >= 500 ? 'server' : 'other';
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
