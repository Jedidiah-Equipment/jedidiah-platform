# Changelog generation prompt

You are generating the user-facing production Changelogs for the Jedidiah platform from a list of
released commits. The commits being released are provided at the end of this prompt inside a
`<commits>` block, oldest first.

The platform serves two separate businesses, each with its own users and its own Changelog:

- `equipment` — Jedidiah Equipment: products, quotes, jobs, inventory, purchasing, the public website.
- `contracting` — Jedidiah Contracting: fleet, machines, hour readings, contracting customers and work.

Most users only ever see one business. A change that both businesses' users can see (login, password
reset, user management, switching between businesses, a fix to shared screens) is `shared`.

## Your task

Summarise what changed for **users** since the last production release. Group changes first by
**business** (`equipment`, `contracting`, or `shared`), then by the **Surface** they are visible on:

- `app` — the authenticated web application (`@pkg/web`).
- `lander` — the public marketing site (`@pkg/lander`). Equipment only: never use it under
  `contracting` or `shared`.
- `mobile` — the mobile app (`@pkg/mobile`).

## Classifying a commit

Every commit line ends with a hint derived from the files it touched, for example
`[touches: contracting]`, `[touches: equipment, shared]`, or `[touches: none]`:

- `equipment` / `contracting` — the commit changed that business's own code.
- `shared` — the commit changed code both businesses use.
- `none` — the commit touched only docs, tests or changelogs.

Treat the hint as the primary signal. A commit hinted with one business belongs to that business.
A commit hinted `shared` only is a platform-wide change and belongs under `shared` if it is
user-visible at all. A commit hinted with a business **and** `shared` is usually that business's
feature with some shared plumbing: put it under the business unless the shared part is itself a
user-visible change for the other business. Use the commit scope (`feat(fleet)`, `fix(quotes)`) only
as a tie-breaker, and inspect the diff (`git show <hash>`) when the hint and the subject disagree.

## Rules

- Output **only** a single JSON object. No prose, no markdown, no code fences.
- The JSON has exactly three keys: `equipment`, `contracting` and `shared`. Each is
  `{ "sections": [...] }`. Do **not** include a `releasedAt` field — the release tooling stamps the
  release time itself.
- `sections` is an array. Each element is `{ "surface": <one of app|lander|mobile>, "entries": [...] }`.
- Each entry is `{ "title": <short imperative headline>, "description": <one or two plain sentences> }`.
- Include a Surface only if it has at least one user-visible change. Omit empty Surfaces entirely.
  A key with nothing to say has `"sections": []`.
- Within one key, each Surface appears **at most once**; merge all of its entries into a single
  section. The tooling merges `shared` into both businesses, so never repeat a `shared` entry under a
  business.
- **Omit internal-only changes**: refactors, test-only changes, CI, tooling, dependency bumps,
  docs, and anything with no observable effect for a user. If a release contains only internal
  changes, return all three keys with empty `sections` and the release tooling will handle it.
- Write for a non-technical user. Describe the benefit, not the implementation. Avoid ticket
  numbers, commit hashes, package names, file paths, and the words "equipment" or "contracting" as
  qualifiers — each business's users read only their own Changelog.
- When a commit message is vague, inspect that commit's diff (e.g. `git show <hash>`) to decide
  whether and how it is user-visible before summarising it.

## Output shape

```json
{
  "equipment": {
    "sections": [
      {
        "surface": "app",
        "entries": [
          { "title": "Faster job search", "description": "Search results now load instantly as you type." }
        ]
      }
    ]
  },
  "contracting": {
    "sections": [
      {
        "surface": "mobile",
        "entries": [
          { "title": "Capture machine hours offline", "description": "Readings save on your phone and sync later." }
        ]
      }
    ]
  },
  "shared": {
    "sections": [
      {
        "surface": "app",
        "entries": [
          { "title": "Reset your password from the sign-in page", "description": "Request a reset link by email." }
        ]
      }
    ]
  }
}
```

Remember: emit the JSON object only.
