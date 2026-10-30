import type { Href } from 'expo-router';

/** A Service Record's own screen. */
export const serviceRecordHref = (serviceId: string) => `/contracting/services/${serviceId}` as Href;
