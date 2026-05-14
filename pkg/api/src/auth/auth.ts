import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { type Database, db } from '@pkg/db';
import * as schema from '@pkg/db/schema';
import { betterAuth } from 'better-auth';
import { admin as adminPlugin } from 'better-auth/plugins';
import { recordMockEmail } from '../email/mock-email.js';
import { getApiConfig } from '../env.js';
import { ac, authRoles, defaultAuthRole } from './access-control.js';
import { adminUserSafetyPlugin } from './admin-user-safety.js';

const config = getApiConfig();

export function createAuth(database: Database) {
  return betterAuth({
    appName: 'Jedidiah Platform',
    baseURL: config.API_BASE_URL,
    secret: config.AUTH_SECRET,
    trustedOrigins: config.AUTH_TRUSTED_ORIGINS,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema,
    }),
    plugins: [
      adminPlugin({
        ac,
        adminRoles: ['admin'],
        defaultRole: defaultAuthRole,
        roles: authRoles,
      }),
      adminUserSafetyPlugin(database),
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url, token }) => {
        recordMockEmail(
          {
            to: user.email,
            subject: 'Reset your password',
            text: `Reset your password: ${url}`,
            url,
            token,
            type: 'password-reset',
          },
          config,
        );
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url, token }) => {
        recordMockEmail(
          {
            to: user.email,
            subject: 'Verify your email address',
            text: `Verify your email address: ${url}`,
            url,
            token,
            type: 'email-verification',
          },
          config,
        );
      },
    },
  });
}

export const auth = createAuth(db);

export type Auth = typeof auth;
