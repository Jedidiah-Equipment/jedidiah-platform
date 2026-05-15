import { UserPassword } from '@pkg/schema';
import { z } from 'zod';

export type LoginForm = z.infer<typeof LoginForm>;
export const LoginForm = z.object({
  email: z.email('Enter a valid email address'),
  password: UserPassword,
});
