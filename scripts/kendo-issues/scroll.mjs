import { open, withHarness, waitForLoad, verdict } from "./lib.mjs";

/**
 * #2155: with pages of different sizes, scrollToPage lands on the wrong page
 * (it multiplies the first page's height by the page number) and the
 * toolbar's page number drifts. mixed-12.pdf has a landscape page every third
 * page; text-60.pdf, all A4 portrait, is the control.
 */
const PAGES = 12;

/** The page whose top edge is nearest the top of the viewport, and the toolbar's page number. */
const where = (page) =>
  page.evaluate(() => {
    const sc = document.querySelector(".k-pdf-viewer-canvas");
    const top = sc.getBoundingClientRect().top;
    const gaps = [...sc.querySelectorAll(".k-page")].map((p) => Math.abs(p.getBoundingClientRect().top - top));
    return { atTop: gaps.indexOf(Math.min(...gaps)) + 1, toolbar: Number(document.querySelector(".k-toolbar input").value) };
  });

async function check(file) {
  const { browser, page } = await open({ file, dpr: 1 });
  await waitForLoad(page);
  const jumps = [];
  for (let n = 1; n <= PAGES; n++) {
    await page.evaluate((n) => window.__scrollTo(n), n);
    await page.waitForTimeout(400);
    const { atTop } = await where(page);
    if (atTop !== n) jumps.push(`${n}->${atTop}`);
  }
  // Scroll by hand so page n's top sits at the top of the viewport, then read the toolbar.
  const drift = [];
  for (let n = 1; n <= PAGES; n++) {
    await page.evaluate((n) => {
      const sc = document.querySelector(".k-pdf-viewer-canvas");
      const p = sc.querySelectorAll(".k-page")[n - 1];
      sc.scrollTop += p.getBoundingClientRect().top - sc.getBoundingClientRect().top + 5;
    }, n);
    await page.waitForTimeout(400);
    const { toolbar } = await where(page);
    if (toolbar !== n) drift.push(`${n} shows ${toolbar}`);
  }
  await browser.close();
  return { jumps, drift };
}

await withHarness(async () => {
  for (const file of ["mixed-12.pdf", "text-60.pdf"]) {
    const { jumps, drift } = await check(file);
    const bad = jumps.length || drift.length;
    verdict(file === "text-60.pdf" ? "control" : "#2155", bad ? "CONFIRMED" : "OK",
      `${file}: scrollToPage wrong for ${jumps.length ? jumps.join(" ") : "none"}; toolbar wrong for ${drift.length ? drift.join(", ") : "none"}`);
  }
});
