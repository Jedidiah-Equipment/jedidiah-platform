import type { StatusBadgeColor } from '@pkg/domain';

export type AppPermissionKey = 'notifications' | 'camera' | 'microphone' | 'location' | 'photos';

/** What the OS reports for one permission, or that this phone has nothing to ask for. */
export type AppPermissionReading = { status: string; canAskAgain?: boolean } | 'unavailable';

export type AppPermissionAction = 'allow' | 'open-settings';

export type AppPermissionRow = {
  key: AppPermissionKey;
  label: string;
  description: string;
  statusLabel: string;
  statusColor: StatusBadgeColor;
  action: AppPermissionAction | null;
};

export const APP_PERMISSION_KEYS: readonly AppPermissionKey[] = [
  'notifications',
  'camera',
  'microphone',
  'location',
  'photos',
];

const PERMISSIONS: Record<AppPermissionKey, { label: string; description: string }> = {
  notifications: { label: 'Notifications', description: 'Alerts the app sends you.' },
  camera: { label: 'Camera', description: 'Taking photos and scanning labels.' },
  microphone: { label: 'Microphone', description: 'Recording voice notes.' },
  location: { label: 'Location', description: 'Placing a breakdown report on the map.' },
  photos: { label: 'Photos', description: 'Saving the photos you take to the gallery.' },
};

/** One App Settings row, or null when the phone has nothing to ask: Allow while the OS can ask, else Open Settings. */
export function appPermissionRow(key: AppPermissionKey, reading: AppPermissionReading): AppPermissionRow | null {
  if (reading === 'unavailable') return null;
  const row = { key, ...PERMISSIONS[key] };
  if (reading.status === 'granted') return { ...row, statusLabel: 'Allowed', statusColor: 'green', action: null };
  if (reading.status === 'denied')
    return {
      ...row,
      statusLabel: 'Not allowed',
      statusColor: 'red',
      action: reading.canAskAgain ? 'allow' : 'open-settings',
    };
  return { ...row, statusLabel: 'Not asked yet', statusColor: 'gray', action: 'allow' };
}
