import { appRoleAccess, authorizationStatement } from "@pkg/core";
import { DEFAULT_APP_ROLE } from "@pkg/schema";
import { createAccessControl } from "better-auth/plugins/access";

const betterAuthUserEditActions = ["edit", "create", "update", "set-role", "set-password"] as const;

const betterAuthAuthorizationStatement = {
  ...authorizationStatement,
  user: expandUserActions(authorizationStatement.user),
} as const;

export const ac = createAccessControl(betterAuthAuthorizationStatement);

export const admin = ac.newRole(expandBetterAuthRoleAccess(appRoleAccess.admin));
export const productEditor = ac.newRole(
  expandBetterAuthRoleAccess(appRoleAccess["product-editor"]),
);
export const productViewer = ac.newRole(
  expandBetterAuthRoleAccess(appRoleAccess["product-viewer"]),
);

export const authRoles = {
  admin,
  "product-editor": productEditor,
  "product-viewer": productViewer,
};

export const defaultAuthRole = DEFAULT_APP_ROLE;

function expandBetterAuthRoleAccess<
  TAccess extends Record<string, readonly string[]> & { user: readonly string[] },
>(access: TAccess): Omit<TAccess, "user"> & { user: string[] };
function expandBetterAuthRoleAccess<TAccess extends Record<string, readonly string[]>>(
  access: TAccess,
): TAccess;
function expandBetterAuthRoleAccess<TAccess extends Record<string, readonly string[]>>(
  access: TAccess,
) {
  if (!("user" in access)) {
    return access;
  }

  return {
    ...access,
    user: expandUserActions(access.user),
  };
}

function expandUserActions(actions: readonly string[]) {
  return actions.flatMap((action) => (action === "edit" ? betterAuthUserEditActions : [action]));
}
