# Execute Test Plan

Run a written manual test plan, such as one from [test-plan](../test-plan/README.md), in a headless Playwright browser, and fill in its report. Meant for the agent that does the testing.

## Install

```bash
npx skills@latest add deanvanniekerk/skills --skill execute-test-plan -g -a codex
```

No other skills are required. Needs Node.js and npm. The first run downloads Playwright's Chromium (about 150 MB), and the skill removes it again when done unless another Playwright install still uses it.

## Use

> Use execute-test-plan on the plan at `test-plans/orders-plan.md`. Save the report and screenshots beside it.

The agent starts the apps the plan names. It runs every case through real clicks and typing in a headless Chromium, with screenshots as evidence, and marks each case PASS, FAIL or BLOCKED. Then it restores the plan's test data and removes its Playwright install. It does not change application code or commit anything.

## Expected result

A filled report in the plan's own template, covering every case. It includes a screenshot path for each 📸 case and each failure, plan corrections where the UI differs from the plan, and what was cleaned up or left behind. A case the agent could not drive is BLOCKED with the exact error, never passed from reading code.

See [the example](examples.md) and [agent instructions](SKILL.md). Authored and maintained by Dean van Niekerk; [credits](CREDITS.md), [MIT license](LICENSE.txt).
