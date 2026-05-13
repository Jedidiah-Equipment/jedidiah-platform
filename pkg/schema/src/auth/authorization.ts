import { z } from "zod";

import { AuthId } from "./auth-id.js";

export const APP_ROLES = ["admin", "product-editor", "product-viewer"] as const;

export type AppRole = z.infer<typeof AppRole>;
export const AppRole = z.enum(APP_ROLES);

export const APP_PERMISSIONS = [
  "audit:read",
  "product:read",
  "product:create",
  "product:update",
  "user:list",
  "user:create",
  "user:update",
  "user:set-role",
  "user:set-password",
] as const;

export type AppPermission = z.infer<typeof AppPermission>;
export const AppPermission = z.enum(APP_PERMISSIONS);

export type UserAccessSummary = z.infer<typeof UserAccessSummary>;
export const UserAccessSummary = z.object({
  permissions: z.array(AppPermission),
  role: AppRole.nullable(),
  userId: AuthId,
});

export type UserSummary = z.infer<typeof UserSummary>;
export const UserSummary = z.object({
  emailVerified: z.boolean(),
  id: AuthId,
  name: z.string().trim().min(1),
  email: z.email(),
  role: AppRole,
});

export type UserPassword = z.infer<typeof UserPassword>;
export const UserPassword = z.string().min(8, "Password must be at least 8 characters");

export type UserListResult = z.infer<typeof UserListResult>;
export const UserListResult = z.object({
  users: z.array(UserSummary),
});
