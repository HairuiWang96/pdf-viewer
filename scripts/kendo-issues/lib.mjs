import { existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

/** Shared helpers for the Kendo issue checks. See KENDO-LIMITATIONS.md. */

export const HERE = fileURLToPath(new URL(".", import.meta.url));
export const PUBLIC_DIR = fileURLToPath(new URL("./harness/public/", import.meta.url));
export const OUT_DIR = fileURLToPath(new URL("./out/", import.meta.url));
export const BASE = "http://localhost:5199/";

const isUp = () => fetch(BASE).then((r) => r.ok, () => false);

/**
 * Runs `fn` with the harness being served. Reuses a server that is already up
 * (run-all.mjs starts one for every check), otherwise starts and stops its own.
 */
export async function withHarness(fn) {
  if (!existsSync(PUBLIC_DIR + "text-60.pdf")) {
    console.error("No test PDFs. Run: node scripts/kendo-issues/generate.mjs");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  if (await isUp()) return fn();
  const server = await startHarness();
  try {
    return await fn();
  } finally {
    await server.close();
  }
}

export async function startHarness() {
  const { createServer } = await import("vite");
  const server = await createServer({ configFile: HERE + "harness/vite.config.mjs" });
  await server.listen();
  return server;
}

/**
 * Opens the harness in a fresh headless Chromium. `dpr` is the screen's pixel
 * ratio: 1 for an ordinary monitor, 2 for a retina one. It matters because
 * Kendo sizes every page canvas from it.
 */
export async function open({ file, zoom, flex, shrink, dpr = 2, width = 1280, height = 900 }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width, height } });
  const page = await ctx.newPage();
  await page.addInitScript(trackFreezes);
  const qs = new URLSearchParams({ file, ...(zoom && { zoom }), ...(flex && { flex: 1 }), ...(shrink && { shrink: 1 }) });
  await page.goto(BASE + "?" + qs);
  return { browser, ctx, page };
}

export const waitForLoad = async (page, settleMs = 2500) => {
  await page.waitForFunction(() => window.__loaded || window.__error, null, { timeout: 60000 });
  await page.waitForTimeout(settleMs);
};

/** Longest gap between animation frames, i.e. the longest main-thread freeze. */
function trackFreezes() {
  window.__maxGap = 0;
  let last = performance.now();
  const tick = (t) => {
    window.__maxGap = Math.max(window.__maxGap, t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
export const maxFreeze = (page) => page.evaluate(() => Math.round(window.__maxGap));

/**
 * Resolves true once the page answers a script again, false if it is still
 * frozen after `limitMs`. Polling in 2 s slices keeps one hung evaluate from
 * hiding the moment it recovers.
 */
export async function waitUntilResponsive(page, limitMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    const ok = await Promise.race([
      page.evaluate(() => 1).then(() => true, () => false),
      new Promise((r) => setTimeout(() => r(false), 2000)),
    ]);
    if (ok && Date.now() - t0 > 200) return Date.now() - t0;
  }
  return null;
}

/** Pages whose canvas has the red "PAGE n" title drawn on it. */
export const drawnPages = (page) =>
  page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".k-page canvas").forEach((c, i) => {
      const ctx = c.getContext("2d");
      const s = c.width / 595;
      for (let x = 50; x < 300; x += 10) {
        const d = ctx.getImageData(Math.floor(x * s), Math.floor(60 * s), 1, 1).data;
        if (d[3] > 0 && d[0] > 150 && d[1] < 80) { out.push(i + 1); break; }
      }
    });
    return out;
  });

/** One result line per check, easy to scan and to diff between Kendo versions. */
export const verdict = (issue, status, detail) => console.log(`[${issue}] ${status.padEnd(15)} ${detail}`);
