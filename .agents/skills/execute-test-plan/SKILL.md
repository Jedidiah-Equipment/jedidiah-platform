---
name: execute-test-plan
description: Execute a written manual test plan in a headless Playwright browser, with screenshot evidence and a filled report. Use when asked to execute or run a test plan.
license: MIT
---

# Execute Test Plan

1. **Read** the plan fully, then start the apps it names.
2. **Run** every case in plan order by driving the app in a headless browser. Record PASS / FAIL / BLOCKED. Wrong behaviour is a FAIL; a label or placement that differs from the plan is a plan correction. A case you cannot drive is BLOCKED with the exact error.
3. **Clean up** as below.
4. **Report** in the plan's report template, saved where the plan or your brief says, and return it as your final message.

Application code stays unchanged; nothing is committed or pushed. Prefix every record you create with `QA `.

## Clean up

- Work through the plan's restore checklist. Put every setting you changed back to its original, such as a role, an assignment or a note.
- Remove your `QA ` records the way a user would, such as cancelling a document in the UI. Delete one directly only after the plan's checks show nothing references it.
- Stop every server and close every browser you started, then remove Playwright as below.
- Keep the report and the evidence screenshots.
- List in the report what you cleaned up and anything you had to leave behind.

## Headless browser

Make a new, empty temporary folder outside the repository for Playwright and your test scripts, and note its path. Nothing in it is kept:

```bash
PW_DIR=$(mktemp -d) && echo "$PW_DIR" && cd "$PW_DIR"
npm init -y && npm i playwright
npx playwright install chromium
```

Write each case as a script in `$PW_DIR` and run it with `node`:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:<port>/login');
await page.getByLabel('Email').fill('<email>');
await page.getByLabel('Password').fill('<password>');
await page.getByRole('button', { name: 'Sign in' }).click();
// …the case's steps, through real clicks and typing
await page.screenshot({ path: '<evidence>/<case ID>.png', fullPage: true });
await browser.close();
```

- Sign in through the UI and use the real controls (`getByRole`, `getByLabel`, `getByText`); assert what is rendered.
- Screenshot every 📸 case and every FAIL to `<evidence>/<case ID>.png`, once the expected result is on screen.
- Phone: `viewport: { width: 390, height: 844 }`. Dark theme: `page.emulateMedia({ colorScheme: 'dark' })`. Narrow window: width 800.

### Remove Playwright when done

```bash
pkill -f "$PW_DIR" || true                  # leftover scripts; their headless Chromium exits with them
cd "$PW_DIR" && npx playwright uninstall    # removes the Chromium build unless another Playwright install still uses it
cd / && rm -rf "$PW_DIR"                    # the Playwright package and your scripts
```

Chromium lives in the shared cache (`~/Library/Caches/ms-playwright` on macOS, `~/.cache/ms-playwright` on Linux), not in `$PW_DIR`, so deleting that folder alone leaves it behind. Run `npx playwright uninstall` without `--all`, so other projects keep the browsers they use.
