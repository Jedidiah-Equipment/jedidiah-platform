# Changelog generation prompt

You are generating a user-facing production Changelog for the Jedidiah platform from a list of
released commits. The commits being released are provided at the end of this prompt inside a
`<commits>` block, oldest first.

## Your task

Summarise what changed for **users** since the last production release. Group changes by the
**Surface** they are visible on:

- `app` — the authenticated web application (`@pkg/web`).
- `lander` — the public marketing site (`@pkg/lander`).
- `mobile` — the mobile app (`@pkg/mobile`).

## Rules

- Output **only** a single JSON object. No prose, no markdown, no code fences.
- The JSON must have exactly one key: `sections`. Do **not** include a `releasedAt` field — the
  release tooling stamps the release time itself.
- `sections` is an array. Each element is `{ "surface": <one of app|lander|mobile>, "entries": [...] }`.
- Each entry is `{ "title": <short imperative headline>, "description": <one or two plain sentences> }`.
- Include a Surface only if it has at least one user-visible change. Omit empty Surfaces entirely.
- Each Surface appears **at most once**; merge all of its entries into a single section.
- **Omit internal-only changes**: refactors, test-only changes, CI, tooling, dependency bumps,
  docs, and anything with no observable effect for a user. If a release contains only internal
  changes for every Surface, return `{ "sections": [] }` and the release tooling will handle it.
- Write for a non-technical user. Describe the benefit, not the implementation. Avoid ticket
  numbers, commit hashes, package names, and file paths.
- When a commit message is vague, inspect that commit's diff (e.g. `git show <hash>`) to decide
  whether and how it is user-visible before summarising it.

## Output shape

```json
{
  "sections": [
    {
      "surface": "app",
      "entries": [
        { "title": "Faster job search", "description": "Search results now load instantly as you type." }
      ]
    }
  ]
}
```

Remember: emit the JSON object only.
