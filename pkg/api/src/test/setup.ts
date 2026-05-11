process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5432/app_dev";
process.env.TEST_DATABASE_URL ??= "postgres://app:app@localhost:5432/app_test";
process.env.APP_BASE_URL ??= "http://localhost:5173";
process.env.API_BASE_URL ??= "http://localhost:3000";
process.env.AUTH_SECRET ??= "test-auth-secret-must-be-at-least-thirty-two-chars";
process.env.AUTH_TRUSTED_ORIGINS ??= "http://localhost:5173,http://localhost:3000";
process.env.PORT ??= "3000";
