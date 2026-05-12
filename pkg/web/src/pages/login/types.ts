import { z } from "zod";

export type LoginForm = z.infer<typeof LoginForm>;
export const LoginForm = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
