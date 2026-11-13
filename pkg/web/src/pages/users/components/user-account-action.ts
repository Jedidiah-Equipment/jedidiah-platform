export type UserAccountAction = 'remove' | 'disable' | 'enable';

/**
 * Which of Remove, Disable or Enable the user admin offers: never on the actor's own row, Enable on a Disabled User,
 * and otherwise Remove only for a User nothing references. `hasHistory` is undefined until the verdict loads.
 */
export function userAccountAction({
  canDisable,
  canRemove,
  disabled,
  hasHistory,
  isSelf,
}: {
  canDisable: boolean;
  canRemove: boolean;
  disabled: boolean;
  hasHistory: boolean | undefined;
  isSelf: boolean;
}): UserAccountAction | null {
  if (isSelf) return null;
  if (disabled) return canDisable ? 'enable' : null;
  if (canRemove && hasHistory === false) return 'remove';
  if (canDisable && (hasHistory === true || !canRemove)) return 'disable';
  return null;
}
