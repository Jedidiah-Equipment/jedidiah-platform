/** Error/disabled visual state shared by every form field control. */
export function fieldStateClassNames({ disabled, hasErrors }: { disabled: boolean; hasErrors: boolean }): string {
  return `${hasErrors ? 'border-danger' : 'border-border'}${disabled ? ' opacity-55' : ''}`;
}
