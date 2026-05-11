import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@pkg/db";
import * as schema from "@pkg/db/schema";
import { betterAuth } from "better-auth";
import { recordMockEmail } from "../email/mock-email.js";
import { getApiConfig } from "../env.js";

const config = getApiConfig();

export const auth = betterAuth({
  appName: "Jedidiah Platform",
  baseURL: config.API_BASE_URL,
  secret: config.AUTH_SECRET,
  trustedOrigins: config.AUTH_TRUSTED_ORIGINS,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url, token }) => {
      recordMockEmail(
        {
          to: user.email,
          subject: "Reset your password",
          text: `Reset your password: ${url}`,
          url,
          token,
          type: "password-reset",
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
          subject: "Verify your email address",
          text: `Verify your email address: ${url}`,
          url,
          token,
          type: "email-verification",
        },
        config,
      );
    },
  },
});

export type Auth = typeof auth;
