process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5432/app_dev";
process.env.TEST_DATABASE_URL ??= "postgres://app:app@localhost:5432/app_test";
process.env.APP_BASE_URL ??= "http://localhost:7001";
process.env.API_BASE_URL ??= "http://localhost:7002";
process.env.AUTH_SECRET ??= "test-auth-secret-must-be-at-least-thirty-two-chars";
process.env.AUTH_TRUSTED_ORIGINS ??= "http://localhost:7001,http://localhost:7002";
process.env.PORT ??= "7002";
