import { appRoleAccess, authorizationStatement } from "@pkg/core";
import { DEFAULT_APP_ROLE } from "@pkg/schema";
import { createAccessControl } from "better-auth/plugins/access";

export const ac = createAccessControl(authorizationStatement);

export const admin = ac.newRole(appRoleAccess.admin);
export const productEditor = ac.newRole(appRoleAccess["product-editor"]);
export const productViewer = ac.newRole(appRoleAccess["product-viewer"]);

export const authRoles = {
  admin,
  "product-editor": productEditor,
  "product-viewer": productViewer,
};

export const defaultAuthRole = DEFAULT_APP_ROLE;
