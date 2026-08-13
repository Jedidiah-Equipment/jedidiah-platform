import { resolveMetaPixelId } from './analytics-config.js';

const META_PIXEL_SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';
const META_PIXEL_SCRIPT_SELECTOR = 'script[data-meta-pixel]';
const META_PIXEL_INITIALIZED_IDS_KEY = '__jedidiahMetaPixelIds';

type MetaPixelFunction = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  loaded: boolean;
  push: MetaPixelFunction;
  queue: unknown[][];
  version: string;
};

declare global {
  interface Window {
    __jedidiahMetaPixelIds?: string[];
    _fbq?: MetaPixelFunction;
    fbq?: MetaPixelFunction;
  }
}

const initializedPixelIds = new Set<string>();

function installMetaPixelQueue(): MetaPixelFunction {
  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  }) as MetaPixelFunction;

  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  return fbq;
}

function loadMetaPixelScript(): void {
  if (
    document.querySelector(META_PIXEL_SCRIPT_SELECTOR) ||
    document.querySelector(`script[src="${META_PIXEL_SCRIPT_URL}"]`)
  ) {
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.dataset.metaPixel = '';
  script.src = META_PIXEL_SCRIPT_URL;
  document.head.append(script);
}

export function initMetaPixel(pixelId: string | null = resolveMetaPixelId(import.meta.env)): boolean {
  if (typeof window === 'undefined' || !pixelId) {
    return false;
  }

  const fbq = window.fbq ?? installMetaPixelQueue();
  loadMetaPixelScript();

  const baseCodeInitialized = window.__jedidiahMetaPixelIds?.includes(pixelId) === true;
  if (!initializedPixelIds.has(pixelId) && !baseCodeInitialized) {
    fbq('init', pixelId);
  }
  initializedPixelIds.add(pixelId);

  return true;
}

export function trackMetaPageView(pixelId: string | null = resolveMetaPixelId(import.meta.env)): void {
  if (initMetaPixel(pixelId)) {
    window.fbq?.('track', 'PageView');
  }
}

type MetaPageViewNavigation = { fromLocation?: unknown; hrefChanged: boolean };

export function trackMetaPageViewForNavigation(
  navigation: MetaPageViewNavigation,
  trackPageView: () => void = trackMetaPageView,
): void {
  // The base code owns the initial PageView. TanStack omits fromLocation for that first resolution, while
  // hrefChanged excludes loader refreshes that resolve again without moving the visitor.
  if (navigation.fromLocation && navigation.hrefChanged) {
    trackPageView();
  }
}

export function trackMetaViewContent(
  eventId: string,
  pixelId: string | null = resolveMetaPixelId(import.meta.env),
): void {
  if (initMetaPixel(pixelId)) {
    window.fbq?.('track', 'ViewContent', {}, { eventID: eventId });
  }
}

export function createMetaEventId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Meta only needs a unique deduplication token. getRandomValues covers older browsers that predate
  // crypto.randomUUID, without letting analytics break catalog views or an already accepted enquiry.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function trackMetaLead(eventId: string, pixelId: string | null = resolveMetaPixelId(import.meta.env)): void {
  if (initMetaPixel(pixelId)) {
    window.fbq?.('track', 'Lead', {}, { eventID: eventId });
  }
}

export function metaPixelNoScriptUrl(pixelId: string | null = resolveMetaPixelId(import.meta.env)): string | null {
  return pixelId ? `https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1` : null;
}

export function metaPixelBaseCode(pixelId: string): string {
  const serializedPixelId = JSON.stringify(pixelId).replace(/</g, '\\u003c');

  return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','${META_PIXEL_SCRIPT_URL}');fbq('init',${serializedPixelId});fbq('track','PageView');window.${META_PIXEL_INITIALIZED_IDS_KEY}=(window.${META_PIXEL_INITIALIZED_IDS_KEY}||[]).concat(${serializedPixelId});`;
}
