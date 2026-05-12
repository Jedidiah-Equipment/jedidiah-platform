import type { Context } from "@/trpc/context.js";

export function mockSession(): NonNullable<Context["session"]> {
  return {
    session: {
      id: "test-session-id",
      userId: "test-user-id",
      token: "test-token",
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    user: {
      id: "test-user-id",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as NonNullable<Context["session"]>;
}
