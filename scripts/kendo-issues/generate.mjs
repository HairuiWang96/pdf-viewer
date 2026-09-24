import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PUBLIC_DIR } from "./lib.mjs";

/**
 * Writes the test PDFs the Kendo issue checks open, into harness/public.
 * Generated rather than committed: the 1,300-page file alone is 1.5 MB.
 *
 * Every page carries a big red "PAGE n" title (the checks sample its pixels to
 * tell a drawn page from a blank one). The print files also carry an 8-bit
 * page-number barcode in the top-left, so page order can be read back from
 * the print window's pixels.
 */
const A4 = [595.28, 841.89];
const A4L = [841.89, 595.28];
const LOREM =
  "The quick brown fox jumps over the lazy dog while the case officer reviews the attached evidence and signs the report. ";

async function make(name, pageCount, sizeOf, { lines = 40, barcode = false, heavy = () => false } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pageCount; i++) {
    const [w, h] = sizeOf(i);
    const page = doc.addPage([w, h]);
    if (barcode) {
      // Black square = 1, most significant bit first, 20pt squares from x=20.
      for (let b = 0; b < 8; b++) {
        page.drawRectangle({
          x: 20 + b * 20, y: h - 40, width: 20, height: 20,
          color: (i >> (7 - b)) & 1 ? rgb(0, 0, 0) : rgb(1, 1, 1),
          borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.5,
        });
      }
      page.drawText(`PAGE ${i}`, { x: 40, y: h / 2, size: 60, font: bold, color: rgb(0.8, 0, 0) });
    } else {
      page.drawText(`PAGE ${i}`, { x: 40, y: h - 90, size: 60, font: bold, color: rgb(0.8, 0, 0) });
      for (let l = 0; l < lines; l++) {
        const y = h - 130 - l * 14;
        if (y < 30) break;
        page.drawText(`${i}.${l} ${LOREM}`.slice(0, Math.floor((w - 80) / 4.6)), { x: 40, y, size: 9, font });
      }
    }
    // Thousands of vector circles make a page slow to draw, so print renders finish out of order.
    if (heavy(i)) {
      for (let k = 0; k < 6000; k++) {
        page.drawCircle({
          x: 30 + ((k * 37) % (w - 60)), y: 60 + ((k * 53) % (h / 2 - 120)), size: 2 + (k % 5),
          borderColor: rgb((k % 7) / 7, 0.3, 0.6), borderWidth: 0.4,
        });
      }
    }
  }
  writeFileSync(join(PUBLIC_DIR, name), await doc.save());
  console.log(`  ${name} (${pageCount} pages)`);
}

/**
 * The #2201 reporter's own PDF, from the sample project attached to the issue
 * (a base64 string inside src/base64Sample.js). Optional: the scrollbar check
 * falls back to a generated A4-landscape file when this can't be fetched.
 */
async function fetchReporterPdf() {
  const url = "https://github.com/user-attachments/files/26060931/pdf-viewer-test.zip";
  const zip = join(tmpdir(), "kendo-2201.zip");
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    const js = execFileSync("unzip", ["-p", zip, "pdf-viewer-test/src/base64Sample.js"]).toString();
    const base64 = js.match(/"([A-Za-z0-9+/=]{1000,})"/)[1];
    writeFileSync(join(PUBLIC_DIR, "r2201.pdf"), Buffer.from(base64, "base64"));
    console.log("  r2201.pdf (from the #2201 issue)");
  } catch (e) {
    console.warn(`  r2201.pdf skipped (${e.message}); the scrollbar check will use a generated file`);
  } finally {
    rmSync(zip, { force: true });
  }
}

mkdirSync(PUBLIC_DIR, { recursive: true });
console.log(`Writing test PDFs to ${PUBLIC_DIR}`);
for (const n of [60, 100, 200, 400, 1300]) await make(`text-${n}.pdf`, n, () => A4);
await make("mixed-12.pdf", 12, (i) => (i % 3 === 0 ? A4L : A4));
await make("a4-landscape-5.pdf", 5, () => A4L);
await make("print-order-30.pdf", 30, (i) => (i % 2 ? A4 : A4L), { barcode: true, heavy: (i) => i % 4 === 1 });
await make("print-a4p-5.pdf", 5, () => A4, { barcode: true });
await make("print-a4l-5.pdf", 5, () => A4L, { barcode: true });
await fetchReporterPdf();
