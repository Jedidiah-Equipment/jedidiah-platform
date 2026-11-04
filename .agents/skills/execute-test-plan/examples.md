# Example run excerpt

This is a fictional example, not a record of a real run.

## A case script

```js
// $PW_DIR/ord-01.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/login');
await page.getByLabel('Email').fill('manager@example.test');
await page.getByLabel('Password').fill('test-password');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('link', { name: 'QA Order 1' }).click();
await page.getByRole('button', { name: 'Confirm order' }).click();
await page.getByText('Delivery address is incomplete').waitFor();
await page.screenshot({ path: 'evidence/ORD-01.png', fullPage: true });
await browser.close();
```

## Report lines

```text
ORD-01 | PASS    | evidence/ORD-01.png | refusal shown; order still Draft after reload
ORD-02 | FAIL    | evidence/ORD-02.png | expected Confirmed after reload, saw Draft
ORD-03 | BLOCKED | -                   | API returned 502 from the local proxy: "connect ECONNREFUSED 127.0.0.1:4000"

Plan corrections: the button is "Confirm order", not "Confirm".
Clean up: QA Order 1 and 2 cancelled in the UI; Playwright uninstalled and $PW_DIR removed; nothing left behind.
```
