import type React from 'react';

import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { cn } from '@/lib/utils.js';

type ErrorMessageProps = {
  className?: string;
  error: unknown;
  fallbackMessage: string;
};

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ className, error, fallbackMessage }) => {
  const message = getApiQueryErrorMessage(error, fallbackMessage);

  if (!message) return null;

  return <p className={cn('text-sm text-destructive', className)}>{message}</p>;
};
