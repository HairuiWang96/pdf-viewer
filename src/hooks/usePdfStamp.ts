import { useCallback, useEffect, useState } from 'react';
import { PDF, StandardFonts, measureText, rgb } from '@libpdf/core';
import type { CaseStamp } from '../types';

/**
 * A Standard 14 font needs no embedding here — it is named rather than
 * supplied, and `measureText` works off the same name. pdf-lib needed an
 * `embedFont` round trip before it could measure anything.
 */
const STAMP_FONT = StandardFonts.Helvetica;
const STAMP_SIZE = 8;

/**
 * The bar's geometry lives here rather than in CSS because the bar is not
 * HTML. It is drawn into the PDF itself — drawing commands written into each
 * page's content stream — and pdf.js then paints the page onto a canvas, so
 * there is no DOM element for a stylesheet to reach.
 *
 * That is the point of a stamp: it travels with the file, so it survives a
 * download or a print. An HTML overlay styled with CSS would only exist on
 * screen, and would have to track zoom, rotation and scrolling per page.
 *
 * The units differ too. These are PDF points (1/72 inch) measured from the
 * page's bottom-left corner, and they hold at every zoom level; CSS pixels
 * are on-screen sizes.
 */
const BAR_MARGIN = 20;
const BAR_TOP = 18;
const BAR_HEIGHT = 18;

/** `2026-04-05` → `04/05/2026`, the way the filing header prints dates. */
function formatFiledDate(iso: string) {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${month}/${day}/${year}` : iso;
}

/** The five fields of the header bar, left to right, for one page. */
export function stampFields(stamp: CaseStamp, pageNumber: number, pageCount: number) {
  return [
    `Case ${stamp.caseNumber}`,
    stamp.title,
    `Filed: ${formatFiledDate(stamp.createdDate)}`,
    `Page ID: ${stamp.id}`,
    `Page ${pageNumber} of ${pageCount}`,
  ];
}

/**
 * Draws a court-filing style header bar across the top of every page — case,
 * document, filed date, page ID and page number, spaced evenly inside a thin
 * bordered box — and hands back a blob URL.
 *
 * `defaultOn` is the toggle's resting position: OFF while the user is picking
 * between several cases, ON when there is only one case to look at. The choice
 * is stored against the `resetKey` it was made under — bumped every time a case
 * is selected — so picking a case always starts from the default rather than
 * inheriting the previous case's toggle.
 *
 * `stamp` must be a stable object — the effect compares it by reference, so
 * one built inline on every render would restamp the file on every render,
 * and since restamping sets state, that never stops. The case's metadata
 * entry, straight from the JSON, is the same object each time; pass that.
 */
export default function usePdfStamp(
  filePath: string,
  stamp: CaseStamp | null,
  { defaultOn = false, resetKey = 0 }: { defaultOn?: boolean; resetKey?: number } = {},
) {
  const [stampChoice, setStampChoice] = useState({ resetKey, on: defaultOn });
  const [stampedUrl, setStampedUrl] = useState<string | null>(null);

  const showStamp = stampChoice.resetKey === resetKey ? stampChoice.on : defaultOn;

  const toggleStamp = useCallback(
    (stamped: boolean) => {
      setStampChoice({ resetKey, on: stamped });
    },
    [resetKey],
  );

  useEffect(() => {
    // No case selected means nothing to print, so leave the original alone.
    if (!showStamp || !stamp) return;
    const fields = stamp;

    // The URL this run created, read at cleanup time rather than captured.
    // Holding it here instead of reading `stampedUrl` in the cleanup is the
    // point: `stampedUrl` is state, so the cleanup would close over its value
    // from the render the effect ran in — null, since this run has not set it
    // yet — and revoke nothing, leaking a whole stamped PDF on every switch.
    let created: string | null = null;
    let cancelled = false;

    async function applyStamp() {
      const response = await fetch(filePath);
      const originalBytes = await response.arrayBuffer();

      /**
       * The drawing is all @libpdf/core, in the browser:
       *
       *   PDF.load        parses the bytes into an editable document
       *   drawRectangle   appends the bar to the page's content stream
       *   drawText        appends each field on top of it — later draws
       *                   paint over earlier ones, so order is layering
       *   measureText     a string's width in points, for the spacing
       *   save            writes the stamped document back out as bytes
       *
       * PDF coordinates start at the page's bottom-left corner with y going
       * up, the reverse of the DOM — so "18pt from the top" is
       * `page.height - BAR_TOP`, and the bar is placed by its bottom edge.
       */
      const doc = await PDF.load(new Uint8Array(originalBytes));
      const pages = doc.getPages();

      pages.forEach((page, index) => {
        const barWidth = page.width - BAR_MARGIN * 2;
        // The bar's bottom edge: down from the top by the margin and its height.
        const barY = page.height - BAR_TOP - BAR_HEIGHT;

        // Drawn first so the text lands on top of it. Solid grey fill so the
        // text stays legible over a scanned page.
        page.drawRectangle({
          x: BAR_MARGIN,
          y: barY,
          width: barWidth,
          height: BAR_HEIGHT,
          color: rgb(0.92, 0.92, 0.92),
          borderColor: rgb(0.6, 0.6, 0.6),
          borderWidth: 0.75,
        });

        // Spaced evenly: the same gap before, between and after every field.
        // A PDF has no layout engine — no flexbox, no text flow — so the
        // spacing is worked out by hand: measure every field, take their total
        // from the bar's width, and split what is left into equal gaps. The
        // 4pt floor keeps fields apart when they overflow; they then run past
        // the bar's right edge rather than wrap, since nothing here wraps.
        const texts = stampFields(fields, index + 1, pages.length);
        const widths = texts.map((text) => measureText(text, STAMP_FONT, STAMP_SIZE));
        const used = widths.reduce((sum, width) => sum + width, 0);
        const gap = Math.max((barWidth - used) / (texts.length + 1), 4);

        // Left to right, each field starting one gap past the end of the last.
        let x = BAR_MARGIN + gap;
        texts.forEach((text, i) => {
          page.drawText(text, {
            x,
            // drawText places the baseline, not the top. Capitals stand about
            // 0.7 of the font size above it, so this centres them in the bar.
            y: barY + (BAR_HEIGHT - STAMP_SIZE * 0.7) / 2,
            size: STAMP_SIZE,
            font: STAMP_FONT,
            color: rgb(0.2, 0.2, 0.2),
          });
          x += widths[i] + gap;
        });
      });

      /**
       * Rewrites the whole file, which has three consequences worth knowing.
       *
       * **Attachments survive.** Embedded files and RichMedia assets are part
       * of the object graph, so they are written back out untouched —
       * verified against all three audio fixtures. That matters because with
       * the stamp on, the viewer and the attachment listing both read this
       * copy rather than the original.
       *
       * **Linearisation does not.** A linearised PDF puts page 1's objects at
       * the front with hint tables, so a reader can render the first page from
       * the opening bytes. Saving here produces the ordinary layout instead —
       * xref at the end, objects wherever the writer put them:
       *
       *     original  /Linearized: true
       *     stamped   /Linearized: false     (the file also shrank by 158 KB)
       *
       * That fixture's linearisation was already stale — revisions appended
       * after it was linearised mean its /L no longer matches the file length,
       * so pdf.js ignored it. The point stands for a valid one, confirmed on
       * case-linearized.pdf: qpdf passes it before stamping, fails it after.
       *
       * Harmless today, because nothing requests byte ranges and this copy is
       * a Blob already held in memory. It matters the moment progressive
       * loading is attempted: stamping would silently undo it, and neither
       * @libpdf/core nor pdf-lib can write a linearised file to put it back.
       * `qpdf --linearize` can, which is one more reason the stamp belongs on
       * a server — stamp, strip the attachment, re-linearise, serve.
       *
       * **Digital signatures break.** A signed file is the original plus an
       * appended revision whose signature covers an exact byte range. Saving
       * flattens both into one new file, so that range no longer matches:
       *
       *     original  2 revisions, /ByteRange ends at 10715 = file length
       *     stamped   1 revision,  /ByteRange ends at 10715, file is 11347
       *
       * `save({ incremental: true })` would keep the signed bytes intact, but
       * a validator would still flag the page content as changed after
       * signing. `npm run compare-pdfs` shows all of this for any file.
       *
       * Size growth is not a concern: six small streams and a font entry per
       * page, independent of file size. The audio is not recompressed.
       */
      const stampedBytes = await doc.save();
      const blob = new Blob([stampedBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      if (cancelled) {
        // The cleanup already ran and saw nothing, so nothing else will
        // revoke this one.
        URL.revokeObjectURL(url);
        return;
      }

      created = url;
      setStampedUrl(url);
    }

    applyStamp().catch((error: unknown) => {
      // A file that fails to fetch or parse should leave the viewer on the
      // unstamped original, not take the page down with an unhandled
      // rejection. activePdfPath already falls back to filePath.
      console.error('Could not stamp the document:', error);
    });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
      // Dropping it here keeps activePdfPath from pointing at a revoked URL
      // while the next stamp is still rendering.
      setStampedUrl(null);
    };
  }, [showStamp, filePath, stamp]);

  const activePdfPath = showStamp && stampedUrl ? stampedUrl : filePath;

  return {
    showStamp,
    toggleStamp,
    activePdfPath,
  };
}
