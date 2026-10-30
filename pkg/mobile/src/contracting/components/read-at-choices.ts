/** Asked before anything else on a capture; the native and web `ReadAtField` share it. */
export const READ_AT_CHOICES = [
  { label: 'Now', value: 'now' },
  { label: 'Earlier…', value: 'earlier' },
] as const;
