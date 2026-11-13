import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { expo } from '@better-auth/expo';
import { type Db, schema } from '@pkg/db';
import { type Auth as BetterAuth, type BetterAuthPlugin, betterAuth } from 'better-auth';
import { admin as adminPlugin } from 'better-auth/plugins';
import { emailSender } from '../email/index.js';
import { getApiConfig } from '../env.js';
import { ac, authRoles } from './access-control.js';
import { roleSlotsPlugin } from './role-slots.js';
import { assertUserCanCreateSession, SIGN_IN_DISABLED_MESSAGE } from './sign-in-eligibility.js';
import { userPhoneValidationPlugin } from './user-phone-validation.js';
import { userRemovalPlugin } from './user-removal.js';

const config = getApiConfig();

type BetterAuthSessionCreateInput = { userId: string };
type BetterAuthEmailCallbackInput = { user: { email: string }; token: string };

function createAuthOptions(database: Db, businessPlugins: readonly BetterAuthPlugin[]) {
  return {
    appName: 'Jedidah Ops',
    baseURL: config.API_BASE_URL,
    secret: config.AUTH_SECRET,
    trustedOrigins: config.AUTH_TRUSTED_ORIGINS,
    advanced: {
      defaultCookieAttributes: {
        partitioned: config.APP_ENV !== 'development',
        sameSite: config.APP_ENV === 'development' ? ('lax' as const) : ('none' as const),
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
          before: async (session: BetterAuthSessionCreateInput) => {
            await assertUserCanCreateSession({ db: database, userId: session.userId });
          },
        },
      },
    },
    user: {
      additionalFields: {
        contractingRole: { type: 'string' as const, required: false as const, input: false as const },
        phoneNumber: { type: 'string' as const, required: false as const, input: true as const },
        // Admin create-user accepts server-owned data fields, while input:false keeps ordinary
        // profile endpoints from letting a signed-in account make itself a shared device.
        isDevice: {
          type: 'boolean' as const,
          required: false as const,
          defaultValue: false as const,
          input: false as const,
        },
        // input: false so users cannot self-enable via the non-admin update-user endpoint; only the
        // admin update path (gated by user:update) can set it.
        assistantEnabled: {
          type: 'boolean' as const,
          required: false as const,
          defaultValue: false as const,
          input: false as const,
        },
        // Only the admin update path, gated by user:update, may add someone to the roster.
        quoteSalesperson: {
          type: 'boolean' as const,
          required: false as const,
          defaultValue: false as const,
          input: false as const,
        },
      },
    },
    plugins: [
      adminPlugin({
        ac,
        adminRoles: ['admin'],
        // A Disabled User is never told they are "banned".
        bannedUserMessage: SIGN_IN_DISABLED_MESSAGE,
        roles: authRoles,
      }),
      roleSlotsPlugin(),
      ...businessPlugins,
      // After the business plugins: their leaving gates name the fix, which beats "Disable them instead".
      userRemovalPlugin(database),
      userPhoneValidationPlugin(),
      expo(),
    ],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, token }: BetterAuthEmailCallbackInput) => {
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
      sendVerificationEmail: async ({ user, token }: BetterAuthEmailCallbackInput) => {
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
  };
}

type AuthOptions = ReturnType<typeof createAuthOptions>;

export type Auth = BetterAuth<AuthOptions>;

export function createSharedAuth(database: Db, businessPlugins: readonly BetterAuthPlugin[]): Auth {
  return betterAuth(createAuthOptions(database, businessPlugins));
}
