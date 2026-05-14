export type FormFieldError = {
  message?: string;
};

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
