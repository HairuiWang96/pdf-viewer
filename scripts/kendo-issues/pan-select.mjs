import { open, withHarness, waitForLoad, OUT_DIR, verdict } from "./lib.mjs";

/**
 * #3727: text in the search box can't be fully selected while the hand
 * (panning) tool is on. Triple-clicks the search box in both modes and
 * compares what ends up selected. Screenshots in out/ show the highlight.
 */
await withHarness(async () => {
  const { browser, page } = await open({ file: "mixed-12.pdf", dpr: 2 });
  await waitForLoad(page, 1500);
  await page.locator('button[title="Search"]').click();
  const input = page.locator('input[placeholder="Search"]');
  await input.fill("quick brown");

  const selectAll = async (mode) => {
    await input.click({ clickCount: 3 });
    const selected = await input.evaluate((i) => i.value.slice(i.selectionStart, i.selectionEnd));
    const box = await input.boundingBox();
    await page.screenshot({ path: `${OUT_DIR}pan-select-${mode}.png`, clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });
    return selected;
  };

  const inSelection = await selectAll("selection");
  await page.locator('button[title="Enable panning"]').click();
  const panning = await page.evaluate(() => document.querySelector(".k-pdf-viewer-canvas").classList.contains("k-enable-panning"));
  const inPanning = await selectAll("panning");
  await browser.close();

  if (!panning) return verdict("#3727", "INCONCLUSIVE", "panning mode did not switch on");
  verdict("#3727", inPanning === "quick brown" ? "OK" : "CONFIRMED",
    `triple-click selects "${inSelection}" in selection mode, "${inPanning}" in panning mode`);
});
