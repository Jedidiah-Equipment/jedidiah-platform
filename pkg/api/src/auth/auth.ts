import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { expo } from '@better-auth/expo';
import { type Db, db, schema } from '@pkg/db';
import { betterAuth } from 'better-auth';
import { admin as adminPlugin } from 'better-auth/plugins';
import { emailSender } from '../email/index.js';
import { getApiConfig } from '../env.js';
import { ac, authRoles, defaultAuthRole } from './access-control.js';
import { adminUserSafetyPlugin } from './admin-user-safety.js';
import { assertUserCanCreateSession } from './sign-in-eligibility.js';
import { userPhoneValidationPlugin } from './user-phone-validation.js';

const config = getApiConfig();

export function createAuth(database: Db) {
  return betterAuth({
    appName: 'Jedidah Ops',
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
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            await assertUserCanCreateSession({ db: database, userId: session.userId });
          },
        },
      },
    },
    user: {
      additionalFields: {
        phoneNumber: { type: 'string', required: false, input: true },
        // input: false so users cannot self-enable via the non-admin update-user endpoint; only the
        // admin update path (gated by user:update) can set it.
        assistantEnabled: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    plugins: [
      adminPlugin({
        ac,
        adminRoles: ['admin'],
        defaultRole: defaultAuthRole,
        roles: authRoles,
      }),
      adminUserSafetyPlugin(database),
      userPhoneValidationPlugin(),
      expo(),
    ],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, token }) => {
        const resetUrl = `${config.APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
        await emailSender.send({
          to: user.email,
          subject: 'Reset your Jedidah Ops password',
          html: `<p>Use this link to reset your Jedidah Ops password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
          text: `Use this link to reset your Jedidah Ops password: ${resetUrl}`,
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
          subject: 'Verify your Jedidah Ops email address',
          html: `<p>Use this link to verify your Jedidah Ops email address:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
          text: `Use this link to verify your Jedidah Ops email address: ${verifyUrl}`,
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
