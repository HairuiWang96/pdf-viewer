import { open, withHarness, waitForLoad, drawnPages, maxFreeze, verdict } from "./lib.mjs";

/**
 * #2140 (and the likely cause of #3009 / #1710): Kendo draws every page as
 * soon as the file opens, each at 3x the screen's pixel ratio, with no
 * virtualization. Opens growing files on 1x and 2x screens and records
 * whether the tab crashes.
 */
const CRASH_WAIT_MS = 60000;

async function openAndWatch(file, dpr) {
  const { browser, page } = await open({ file, dpr });
  const t0 = Date.now();
  let crashedAt = null;
  await Promise.race([
    new Promise((r) => page.on("crash", () => { crashedAt = Date.now() - t0; r(); })),
    new Promise((r) => setTimeout(r, CRASH_WAIT_MS)),
  ]);
  const canvases = crashedAt ? null : await page.evaluate(() => document.querySelectorAll(".k-page canvas").length);
  const freeze = crashedAt ? null : await maxFreeze(page);
  await browser.close();
  return { crashedAt, canvases, freeze };
}

await withHarness(async () => {
  // How much Kendo draws up front, on a file small enough to survive.
  const { browser, page } = await open({ file: "text-60.pdf", dpr: 2 });
  await waitForLoad(page, 3000);
  const drawn = (await drawnPages(page)).length;
  const first = await page.evaluate(() => { const c = document.querySelector(".k-page canvas"); return `${c.width}x${c.height}`; });
  const freeze = await maxFreeze(page);
  await browser.close();
  verdict("#2140", drawn === 60 ? "ALL PAGES DRAWN" : "VIRTUALIZED", `60-page file, 2x screen: ${drawn}/60 pages drawn on open, each canvas ${first}px, longest freeze ${freeze}ms`);

  for (const file of ["text-100.pdf", "text-200.pdf", "text-400.pdf", "text-1300.pdf"]) {
    for (const dpr of [1, 2]) {
      const r = await openAndWatch(file, dpr);
      verdict("#2140", r.crashedAt ? "CONFIRMED" : r.freeze > 5000 ? "FREEZES" : "OK",
        `${file}, ${dpr}x screen: ${r.crashedAt ? `tab crashed after ${(r.crashedAt / 1000).toFixed(1)}s` : `no crash in ${CRASH_WAIT_MS / 1000}s, ${r.canvases} canvases, longest freeze ${r.freeze}ms`}`);
    }
  }
});
