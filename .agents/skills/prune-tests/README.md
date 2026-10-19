# Prune Tests

Separate tests that detect real regressions from tests that repeat implementation details. Every case gets a verdict and a reason; a green suite alone is not evidence that a deletion was sound.

## Install

```bash
npx skills@latest add deanvanniekerk/skills --skill prune-tests -g -a codex
```

No other skills are required. Branch scope needs Git. Applying deletions needs the repository's test runner and applicable lint/typecheck commands. Respect its concurrency limits.

## Use

> Audit the tests changed on this branch with prune-tests. Do not edit files.

> Prune low-value tests in the billing package and explain the coverage that survives.

An audit request produces recommendations only. A prune request applies confirmed deletions, removes exclusively used fixtures, and reruns checks. Cases with uncertain value stay in place. An existing failing test is reported or repaired within scope, never discarded to make the suite green.

## Expected result

Scope/base, baseline results, per-case keep/prune/investigate verdicts, deciding evidence, named replacement coverage for duplicates, and final check results. When applying, include counts and the removed cases/files.

The rubric is deliberately opinionated about mock mirrors and duplicate coverage, but mocks and render tests are not inherently worthless. A unit test cannot replace integration coverage merely because both mention the same rule. [Worked cases](examples.md) show the distinction.

## Attribution

Authored and maintained by Dean van Niekerk. Its focus on public behavior is compatible with Matt Pocock's TDD approach, which is acknowledged as related work in [CREDITS.md](CREDITS.md); it is not a required dependency. [MIT license](LICENSE.txt). [Agent instructions](SKILL.md).
