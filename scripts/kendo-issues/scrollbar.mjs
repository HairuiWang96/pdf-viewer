import { existsSync } from "fs";
import { open, withHarness, waitForLoad, PUBLIC_DIR, verdict } from "./lib.mjs";

/**
 * #2201: the page box width is floored (841pt) but the text layer isn't
 * (841.89pt), so the text layer is about 1px wider than its page. That only
 * shows as a scrollbar when the viewer's width comes from its content, as in
 * the reporter's flex layout with no width set ("shrink"). A viewer with a
 * set width is also swept across window widths to show it stays clean.
 */
const measure = (page) =>
  page.evaluate(() => {
    const sc = document.querySelector(".k-pdf-viewer-canvas");
    const pg = sc.querySelector(".k-page");
    const tl = sc.querySelector(".k-text-layer");
    return {
      overflowPx: sc.scrollWidth - sc.clientWidth,
      pageFits: pg.getBoundingClientRect().right <= sc.getBoundingClientRect().left + sc.clientWidth + 0.01,
      pageW: pg.getBoundingClientRect().width.toFixed(2),
      textW: tl.getBoundingClientRect().width.toFixed(2),
    };
  });

await withHarness(async () => {
  const files = ["a4-landscape-5.pdf", ...(existsSync(PUBLIC_DIR + "r2201.pdf") ? ["r2201.pdf"] : [])];
  for (const file of files) {
    const { browser, page } = await open({ file, flex: true, shrink: true, zoom: "1", dpr: 1 });
    await waitForLoad(page);
    const r = await measure(page);
    await browser.close();
    verdict("#2201", r.overflowPx > 0 ? "CONFIRMED" : "OK",
      `${file}, viewer with no width in a flex row: ${r.overflowPx}px horizontal overflow (page ${r.pageW}px, text layer ${r.textW}px)`);
  }

  const { browser, page } = await open({ file: "a4-landscape-5.pdf", flex: true, zoom: "1", dpr: 1, width: 1250 });
  await waitForLoad(page);
  const spurious = [];
  for (let w = 1100; w <= 1250; w++) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(30);
    const r = await measure(page);
    if (r.overflowPx > 0 && r.pageFits) spurious.push(w);
  }
  await browser.close();
  verdict("#2201", spurious.length ? "CONFIRMED" : "OK",
    `viewer with a set width, window 1100-1250px: scrollbar although the page fits at ${spurious.length ? spurious.join(",") : "no width"}`);
});
