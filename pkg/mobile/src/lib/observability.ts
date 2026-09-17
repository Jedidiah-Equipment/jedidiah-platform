import { appEnv } from './app-env';
import type { ObservabilityProperties } from './observability-contract';
import { isStagingRuntimeApp } from './runtime-app-identity';
import type { MobileScreen } from './screen-catalog';

const MAX_BREADCRUMBS = 50;
const MAX_BREADCRUMB_PROPERTIES = 12;
const MAX_PROPERTY_LENGTH = 240;
const projectToken = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const ingestHost = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';

export type BreadcrumbCategory =
  | 'auth'
  | 'connectivity'
  | 'contracting'
  | 'equipment'
  | 'lifecycle'
  | 'navigation'
  | 'network'
  | 'ota'
  | 'storage';

type Breadcrumb = {
  at: string;
  category: BreadcrumbCategory;
  message: string;
  properties: ObservabilityProperties;
};

let initialized = false;
let currentBusiness: MobileScreen['business'] = null;
let currentUserId: string | null = null;
const breadcrumbs: Breadcrumb[] = [];
const capturedErrors = new WeakSet<object>();
let runtimeProperties: ObservabilityProperties = {
  app: 'mobile',
  appEnv,
  appVariant: 'production',
  appVersion: null,
  business: null,
  platform: 'unknown',
  runtimeVersion: null,
  updateId: null,
};

let client: ObservabilityClient = createNoopClient();

/** Starts the one process-wide client and lifecycle breadcrumb listener. Safe to call repeatedly. */
export function initializeObservability(): void {
  if (initialized) return;
  initialized = true;
  // Kept lazy so pure business helpers and their Vitest suites can use this facade without loading
  // React Native's Flow entrypoint. The app root is the one composition site that calls initialize.
  const Constants = require('expo-constants').default as {
    expoConfig?: { scheme?: string | string[]; version?: string };
  };
  const Updates = require('expo-updates') as { runtimeVersion?: string | null; updateId?: string | null };
  const { AppState, Platform } = require('react-native') as {
    AppState: {
      currentState: string;
      addEventListener(event: 'change', listener: (state: string) => void): unknown;
    };
    Platform: { OS: string };
  };
  const PostHog = require('posthog-react-native').default as new (
    token: string,
    options: Record<string, unknown>,
  ) => ObservabilityClient;
  const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  runtimeProperties = {
    ...runtimeProperties,
    appVariant: isStagingRuntimeApp(Constants.expoConfig) ? 'staging' : 'production',
    appVersion: Constants.expoConfig?.version ?? null,
    platform: Platform.OS,
    runtimeVersion: Updates.runtimeVersion ?? null,
    updateId: Updates.updateId ?? null,
  };
  client = new PostHog(projectToken || 'mobile-observability-disabled', {
    host: ingestHost,
    disabled: !projectToken,
    autocapture: false,
    ...(configuredApiBaseUrl ? { addTracingHeaders: [new URL(configuredApiBaseUrl).hostname] } : {}),
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
    errorTracking: {
      autocapture: {
        console: [],
        nativeCrashes: false,
        uncaughtExceptions: true,
        unhandledRejections: true,
      },
    },
    before_send: (event: OutgoingEvent) => {
      if (!event) return event;
      event.properties = { ...redactSensitiveEventProperties(event.properties), ...sharedProperties() };
      if (event.event === '$exception') event.properties.breadcrumbs = breadcrumbSnapshot();
      return event;
    },
  });

  addBreadcrumb('lifecycle', 'cold start', { state: AppState.currentState });
  void registerSharedProperties();

  let previousState = AppState.currentState;
  AppState.addEventListener('change', (state) => {
    addBreadcrumb('lifecycle', state === 'active' && previousState !== 'active' ? 'warm start' : 'state changed', {
      from: previousState,
      state,
    });
    previousState = state;
  });
}

export function addBreadcrumb(
  category: BreadcrumbCategory,
  message: string,
  properties: ObservabilityProperties = {},
): void {
  const breadcrumb = {
    at: new Date().toISOString(),
    category,
    message: capString(message),
    properties: capProperties(properties),
  };
  breadcrumbs.push(breadcrumb);
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  client.addExceptionStep(`${category}: ${breadcrumb.message}`, breadcrumb.properties);
}

export function captureEvent(event: string, properties: ObservabilityProperties = {}): void {
  void client.capture(event, { ...sharedProperties(), ...capProperties(properties) });
}

export function captureException(error: unknown, properties: ObservabilityProperties = {}): void {
  if (isWeakKey(error)) {
    if (capturedErrors.has(error)) return;
    capturedErrors.add(error);
  }
  client.captureException(error, {
    ...sharedProperties(),
    ...capProperties(properties),
    breadcrumbs: breadcrumbSnapshot(),
  });
}

/** Captures native/storage failures without allowing their message to leak a local path or payload. */
export function captureSanitizedException(
  error: unknown,
  safeMessage: string,
  properties: ObservabilityProperties = {},
): void {
  if (isWeakKey(error)) {
    if (capturedErrors.has(error)) return;
    capturedErrors.add(error);
  }
  const sanitized = new Error(safeMessage);
  sanitized.name = safeErrorName(error);
  captureException(sanitized, properties);
}

/** Removes SDK-added navigation values; route patterns come only from the reviewed screen catalog. */
export function redactSensitiveEventProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...properties };
  delete redacted.url;
  delete redacted.$current_url;
  delete redacted.$pathname;
  return redacted;
}

function isWeakKey(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name)) return 'Error';
  return error.name;
}

export function trackScreen(screen: MobileScreen): void {
  currentBusiness = screen.business;
  void registerSharedProperties();
  addBreadcrumb('navigation', 'route changed', { business: screen.business, route: screen.name });
  void client.screen(screen.name, { business: screen.business });
}

/** Identifies by the internal user id only and resets first if a second account takes over the process. */
export function identifyObservabilityUser(userId: string): void {
  if (currentUserId === userId) return;
  if (currentUserId !== null) {
    client.reset();
    addBreadcrumb('auth', 'account switch');
  }
  currentUserId = userId;
  void registerSharedProperties();
  client.identify(userId);
  addBreadcrumb('auth', 'signed in');
}

export function resetObservability(reason: 'account switch' | 'ineligible session' | 'signed out'): void {
  addBreadcrumb('auth', reason);
  client.reset();
  currentUserId = null;
  void registerSharedProperties();
}

export function observabilityBreadcrumbsForTesting(): readonly Breadcrumb[] {
  return breadcrumbSnapshot();
}

function sharedProperties(): ObservabilityProperties {
  return { ...runtimeProperties, business: currentBusiness };
}

function registerSharedProperties(): Promise<void> {
  return client.register(sharedProperties());
}

function breadcrumbSnapshot(): Breadcrumb[] {
  return breadcrumbs.map((breadcrumb) => ({ ...breadcrumb, properties: { ...breadcrumb.properties } }));
}

function capProperties(properties: ObservabilityProperties): ObservabilityProperties {
  return Object.fromEntries(
    Object.entries(properties)
      .slice(0, MAX_BREADCRUMB_PROPERTIES)
      .map(([key, value]) => [capString(key), typeof value === 'string' ? capString(value) : value]),
  );
}

function capString(value: string): string {
  return value.slice(0, MAX_PROPERTY_LENGTH);
}

type OutgoingEvent = { event: string; properties: Record<string, unknown> } | null;

type ObservabilityClient = {
  addExceptionStep(message: string, properties?: ObservabilityProperties): void;
  capture(event: string, properties?: Record<string, unknown>): Promise<void>;
  captureException(error: unknown, properties?: Record<string, unknown>): void;
  identify(userId: string): void;
  register(properties: ObservabilityProperties): Promise<void>;
  reset(): void;
  screen(name: string, properties?: ObservabilityProperties): Promise<void>;
};

function createNoopClient(): ObservabilityClient {
  return {
    addExceptionStep: () => undefined,
    capture: async () => undefined,
    captureException: () => undefined,
    identify: () => undefined,
    register: async () => undefined,
    reset: () => undefined,
    screen: async () => undefined,
  };
}
