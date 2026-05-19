import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ResetPasswordPage } from '@/pages/reset-password/ResetPasswordPage.js';

export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({ token: z.string().min(1) }),
  component: ResetPasswordPage,
});
