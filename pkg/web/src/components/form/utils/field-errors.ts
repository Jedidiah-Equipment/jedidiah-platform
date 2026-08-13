export type FormFieldError = {
  message?: string;
};

/**
 * One field's errors gathered from more than one source — its own validator meta plus the autosave
 * flush's issues — with a message repeated by both sources shown once.
 */
export function mergeFieldErrors(...errorGroups: readonly (readonly unknown[])[]): FormFieldError[] {
  const seen = new Set<string | undefined>();

  return errorGroups
    .flatMap((errors) => getFieldErrors([...errors]))
    .filter((error) => {
      if (seen.has(error.message)) {
        return false;
      }

      seen.add(error.message);
      return true;
    });
}

export function getFieldErrors(errors: unknown[]): FormFieldError[] {
  return errors.flatMap((error) => {
    if (typeof error === 'string') {
      return [{ message: error }];
    }

    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      return [{ message: error.message }];
    }

    return [];
  });
}
