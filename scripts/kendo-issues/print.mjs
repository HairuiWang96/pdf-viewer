import { writeFileSync } from "fs";
import { PDFDocument } from "pdf-lib";
import { open, withHarness, waitForLoad, OUT_DIR, verdict } from "./lib.mjs";

/**
 * Kendo prints by opening a popup with one image per page and calling
 * print() on it. This captures that popup instead of printing, then checks:
 *   #1819  page order: each page carries a binary page-number barcode, read back from pixels
 *   #1543  resolution of the print images
 *   #3742  pagination: Chrome's print-to-PDF lays the popup out on paper, and
 *          the sheets are counted. Same layout engine as the print dialog.
 * The printouts are kept in out/ for a look.
 */
async function capturePrint(file, dpr) {
  const { browser, ctx, page } = await open({ file, dpr });
  await waitForLoad(page, 3000);
  // Kendo calls print() on the popup right after opening it, and closes the
  // popup once printing finishes (page.pdf() below counts too). Stub both the
  // moment the popup exists, before Kendo's own code can reach them.
  await page.evaluate(() => {
    const open = window.open.bind(window);
    window.open = (...args) => {
      const w = open(...args);
      if (w) { w.print = () => {}; w.close = () => {}; }
      return w;
    };
  });
  const popupP = ctx.waitForEvent("page", { timeout: 120000 });
  await page.locator('button[title="Print"]').click();
  const pop = await popupP;
  await pop.waitForFunction(() => document.querySelectorAll("canvas").length > 0, null, { timeout: 120000 });
  await pop.waitForTimeout(1500);
  const pages = await pop.evaluate(() =>
    [...document.querySelectorAll("canvas")].map((c) => {
      const ctx = c.getContext("2d");
      const pxPerPt = c.width / (c.width > c.height ? 841.89 : 595.28);
      let n = 0;
      for (let b = 0; b < 8; b++) {
        const d = ctx.getImageData(Math.floor((30 + b * 20) * pxPerPt), Math.floor(30 * pxPerPt), 1, 1).data;
        if (d[0] < 100) n |= 1 << (7 - b);
      }
      return { n, dpi: Math.round(pxPerPt * 72) };
    }),
  );
  return { browser, pop, pages };
}

async function sheets(pop, file, format, landscape) {
  const buf = await pop.pdf({ format, landscape, printBackground: true });
  writeFileSync(`${OUT_DIR}print-${file.replace(".pdf", "")}-${format}${landscape ? "L" : "P"}.pdf`, buf);
  return (await PDFDocument.load(buf)).getPageCount();
}

await withHarness(async () => {
  {
    const { browser, pages } = await capturePrint("print-order-30.pdf", 2);
    const order = pages.map((p) => p.n);
    const inOrder = order.every((n, i) => n === i + 1);
    verdict("#1819", inOrder ? "OK" : "CONFIRMED", `30 pages printed in order ${order.join(",")}`);
    verdict("#1543", pages[0].dpi >= 200 ? "OK" : "CONFIRMED", `2x screen: print images at ${pages[0].dpi} dpi`);
    await browser.close();
  }
  for (const [file, label] of [["print-a4p-5.pdf", "5 A4 portrait pages"], ["print-a4l-5.pdf", "5 A4 landscape pages"]]) {
    const { browser, pop, pages } = await capturePrint(file, 1);
    if (file === "print-a4p-5.pdf") verdict("#1543", pages[0].dpi >= 200 ? "OK" : "CONFIRMED", `1x screen: print images at ${pages[0].dpi} dpi`);
    const counts = [];
    for (const format of ["A4", "A5", "A1"]) counts.push(`${format} ${await sheets(pop, file, format, false)}`);
    const wrong = counts.some((c) => Number(c.split(" ")[1]) !== pages.length);
    verdict("#3742", wrong ? "CONFIRMED" : "OK", `${label}, sheets printed per paper size: ${counts.join(", ")} (should be ${pages.length})`);
    await browser.close();
  }
});
