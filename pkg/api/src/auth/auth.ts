import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { type Db, db, schema } from '@pkg/db';
import { betterAuth } from 'better-auth';
import { admin as adminPlugin } from 'better-auth/plugins';
import { emailSender } from '../email/index.js';
import { getApiConfig } from '../env.js';
import { ac, authRoles, defaultAuthRole } from './access-control.js';
import { adminUserSafetyPlugin } from './admin-user-safety.js';

const config = getApiConfig();

export function createAuth(database: Db) {
  return betterAuth({
    appName: 'Jedidiah Platform',
    baseURL: config.API_BASE_URL,
    secret: config.AUTH_SECRET,
    trustedOrigins: config.AUTH_TRUSTED_ORIGINS,
    advanced: {
      defaultCookieAttributes: {
        partitioned: config.APP_ENV !== 'development',
        sameSite: config.APP_ENV === 'development' ? 'lax' : 'none',
        secure: config.APP_ENV !== 'development',
      },
    },
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
      disableSignUp: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, token }) => {
        const resetUrl = `${config.APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
        await emailSender.send({
          to: user.email,
          subject: 'Reset your Jedidiah Equipment password',
          html: `<p>Use this link to reset your Jedidiah Equipment password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
          url: resetUrl,
          token,
          type: 'password-reset',
        });
      },
    },
    emailVerification: {
      sendOnSignIn: true,
      sendVerificationEmail: async ({ user, token }) => {
        const verifyUrl = `${config.APP_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;
        await emailSender.send({
          to: user.email,
          subject: 'Verify your Jedidiah Equipment email address',
          html: `<p>Use this link to verify your Jedidiah Equipment email address:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
          url: verifyUrl,
          token,
          type: 'email-verification',
        });
      },
    },
  });
}

export const auth = createAuth(db);

export type Auth = typeof auth;
