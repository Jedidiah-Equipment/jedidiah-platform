# Core, API, and web have separate error responsibilities

Expected business failures are represented in `@pkg/core` as feature-specific error classes with diagnostic/internal messages, structured metadata when useful, and stable globally namespaced machine codes such as `product.not_found`. The API layer owns the mapping from those core errors to transport status, public user-facing messages, and exposed `appCode`s; each feature router maps only that feature's known core-error union exhaustively and preserves the original core error as the `cause`. The web treats API messages as the public copy for expected failures and uses shared presentation helpers for fallbacks, while development-only detail belongs in logs and console output rather than visible UI.

## Consequences

- Core errors do not know about HTTP, tRPC, toast copy, or production display rules.
- Core error metadata is diagnostic by default and is not exposed unless an API mapper explicitly decides it is safe.
- Authorization failures live where the rule is owned: API preflights throw API-owned auth errors, domain/policy denials remain feature core errors, and Better Auth endpoint denials stay at the Better Auth boundary.
- API-owned auth/preflight errors may expose API-owned `appCode`s such as `auth.unauthenticated` or `auth.forbidden`; these are not core error codes and do not need feature mapper exhaustiveness.
- tRPC `onError` and error formatting are used for logging and response shaping, not as the primary place where core errors become public errors.
- Validation errors at schema/input boundaries remain transport validation failures rather than app-specific core errors.
- Unknown errors bubble to global handling, return the generic public message "Something went wrong. Please try again.", and do not expose an `appCode`; an unmapped known feature error is a programmer bug and must fail loudly rather than silently falling back to public copy.
- Expected mapped errors, API preflight denials, and validation failures are normal control flow and are not logged as API errors by default; unexpected errors are logged with diagnostic context.
- Shared tRPC error helpers live under `pkg/api/src/trpc/`; feature-specific maps stay near the routers and may remain inline while small.
- Each core feature exports its own error union and explicit type guard beside the error classes; API mappers use that guard rather than duck-typing arbitrary `{ code }` objects.
