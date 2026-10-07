/** What every action policy answers: allowed, or refused with the first reason and the one sentence that says why. */
export type ActionVerdict = { allowed: true } | { allowed: false; reason: string; message: string };

/** The person holds the action's permission; only the entity's state or ownership can still refuse it. */
export const holdsAction = (verdict: ActionVerdict): boolean => verdict.allowed || verdict.reason !== 'no-permission';

export const actionRefusal = (verdict: ActionVerdict): string | undefined =>
  verdict.allowed ? undefined : verdict.message;

/**
 * A card action's presentation: null when the person lacks the permission (render nothing), otherwise shown,
 * and disabled with the refusal's sentence while the entity refuses it. Web spreads it on a button as
 * `{disabled, title}`; the phone shows `title` under the button.
 */
export function presentAction(verdict: ActionVerdict): { disabled: boolean; title: string | undefined } | null {
  return holdsAction(verdict) ? { disabled: !verdict.allowed, title: actionRefusal(verdict) } : null;
}

/** Every verdict of one entity read the way a detail page reads them. */
export function actionSheet<Name extends string>(actions: Record<Name, ActionVerdict>) {
  const verdict = (name: Name) => actions[name];
  return {
    verdict,
    can: (name: Name) => verdict(name).allowed,
    holds: (name: Name) => holdsAction(verdict(name)),
    refusal: (name: Name) => actionRefusal(verdict(name)),
    action: (name: Name) => presentAction(verdict(name)),
  };
}
