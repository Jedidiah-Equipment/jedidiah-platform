import { NullablePhoneNumber } from '@pkg/schema';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';

const INVALID_PHONE_NUMBER_ERROR = {
  code: 'INVALID_PHONE_NUMBER',
  message: 'Enter a valid South African phone number.',
} as const;

// Validates the phoneNumber additional field on the admin create/update endpoints before it is
// persisted, so later reads never fail to parse a stored phone number.
export function userPhoneValidationPlugin(): BetterAuthPlugin {
  return {
    id: 'user-phone-validation',
    hooks: {
      before: [
        {
          matcher: ({ path }) => path === '/admin/create-user' || path === '/admin/update-user',
          handler: createAuthMiddleware(async (ctx) => {
            const data = isRecord(ctx.body) && isRecord(ctx.body.data) ? ctx.body.data : undefined;

            if (!data || !('phoneNumber' in data)) {
              return;
            }

            const result = NullablePhoneNumber.safeParse(data.phoneNumber);

            if (!result.success) {
              throw APIError.from('BAD_REQUEST', INVALID_PHONE_NUMBER_ERROR);
            }

            // Persist the normalized (trimmed) value.
            data.phoneNumber = result.data;
          }),
        },
      ],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
