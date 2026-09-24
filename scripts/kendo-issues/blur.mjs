import { open, withHarness, waitForLoad, BASE, OUT_DIR, verdict } from "./lib.mjs";

/**
 * #1539: text looks blurry when zoomed out on a small screen. Screenshots the
 * same stretch of text from Kendo at 80% and from plain pdf.js (ref.html) at
 * the same size, on a 1x screen, and scores each by average edge contrast.
 * Blurry text scores lower. Both crops are kept in out/ for a look.
 */
const ZOOM = 0.8;
const CLIP = { width: 360, height: 90 };

/** Mean absolute difference between horizontally neighbouring pixels. */
const sharpness = (page, png) =>
  page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    let sum = 0;
    for (let y = 0; y < height; y++)
      for (let x = 1; x < width; x++) sum += Math.abs(data[(y * width + x) * 4] - data[(y * width + x - 1) * 4]);
    return sum / (width * height);
  }, png.toString("base64"));

await withHarness(async () => {
  const { browser, page } = await open({ file: "text-60.pdf", zoom: String(ZOOM), dpr: 1, width: 900 });
  await waitForLoad(page, 3000);
  // Hide the text layer and the licence banner so only the drawn canvas is captured.
  await page.evaluate(() => document.querySelectorAll(".k-text-layer, .k-notification-group").forEach((e) => (e.style.visibility = "hidden")));
  const box = await page.evaluate(() => { const r = document.querySelector(".k-page").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  const kendo = await page.screenshot({ path: OUT_DIR + "blur-kendo.png", clip: { x: box.x + 20, y: box.y + 100, ...CLIP } });

  const ref = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 900, height: 900 } });
  await ref.goto(`${BASE}ref.html?file=text-60.pdf&scale=${box.w / 595.28}`);
  await ref.waitForFunction(() => window.__done);
  const plain = await ref.screenshot({ path: OUT_DIR + "blur-pdfjs.png", clip: { x: 20, y: 100, ...CLIP } });

  const k = await sharpness(page, kendo);
  const p = await sharpness(page, plain);
  await browser.close();
  // The Kendo crop includes the faint licence watermark, which nudges its score slightly.
  verdict("#1539", k < p * 0.85 ? "CONFIRMED" : "OK",
    `${ZOOM * 100}% zoom, 1x screen: Kendo sharpness ${k.toFixed(1)} vs plain pdf.js ${p.toFixed(1)} (lower = blurrier)`);
});
