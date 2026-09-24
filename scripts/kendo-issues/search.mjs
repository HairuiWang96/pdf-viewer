import { open, withHarness, waitForLoad, waitUntilResponsive, verdict } from "./lib.mjs";

/**
 * #2783 / #1597: search freezes the page. Kendo searches on every keystroke
 * and adds one highlight element per matched character, so the freeze grows
 * with the number of matches rather than the number of pages.
 *
 * "type" sends keystrokes one by one, as a user does; "paste" inserts the
 * whole term at once, the best case. "#" matches nothing and is the control.
 */
const LIMIT_MS = 120000;
const CASES = [
  ["text-60.pdf", "#", "type"],
  ["text-60.pdf", "e", "type"],
  ["text-60.pdf", "evidence", "paste"],
  ["text-200.pdf", "PAGE 150", "paste"],
  ["text-200.pdf", "evidence", "paste"],
];

await withHarness(async () => {
  for (const [file, term, how] of CASES) {
    const { browser, page } = await open({ file, dpr: 1 });
    await waitForLoad(page, 4000);
    await page.locator('button[title="Search"]').click();
    const input = page.locator('input[placeholder="Search"]');
    await input.focus();
    // Not awaited: while the page is frozen the keyboard call hangs too.
    (how === "type" ? page.keyboard.type(term) : page.keyboard.insertText(term)).catch(() => {});
    const ms = await waitUntilResponsive(page, LIMIT_MS);
    const hits = ms ? await page.evaluate(() => document.querySelectorAll('[class*="search-highlight"]').length) : null;
    await browser.close();
    const frozen = ms === null || ms > 5000;
    verdict(term === "#" ? "control" : "#2783", frozen ? "CONFIRMED" : "OK",
      `${file}, ${how} "${term}": ${ms === null ? `still frozen after ${LIMIT_MS / 1000}s` : `page frozen for ${(ms / 1000).toFixed(1)}s, ${hits} highlight elements`}`);
  }
});
