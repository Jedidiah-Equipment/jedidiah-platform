-- better-auth 1.7 keys a provider identity on (issuer, accountId) instead of providerId, so `account`
-- gains a required `issuer` and a unique index over the pair. Sign-in matches on it and reports a miss
-- as "invalid email or password", so the backfill has to land before the NOT NULL: an unfilled row
-- would not error, it would just stop being able to sign in.
ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "account" SET "issuer" = 'local:credential' WHERE "provider_id" = 'credential';--> statement-breakpoint
-- Deliberately covers only `credential`, the sole provider configured. An OAuth row would need
-- `local:oauth:<encoded providerId>`, and guessing one here would hand it a wrong identity silently;
-- leaving it NULL fails this statement instead.
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_uidx" ON "account" USING btree ("issuer","account_id");
