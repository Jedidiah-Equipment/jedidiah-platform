import { appRoleAccess, authorizationStatement, DEFAULT_APP_ROLE } from "@pkg/domain";
import { createAccessControl } from "better-auth/plugins/access";

export const ac = createAccessControl(authorizationStatement);

export const authRoles = {
  admin: ac.newRole(appRoleAccess.admin),
  "product-editor": ac.newRole(appRoleAccess["product-editor"]),
  "product-viewer": ac.newRole(appRoleAccess["product-viewer"]),
};

export const defaultAuthRole = DEFAULT_APP_ROLE;
