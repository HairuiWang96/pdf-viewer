import { PDF, PdfArray, PdfDict } from '@libpdf/core';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

/**
 * Compares two PDFs side by side — made for checking what the case stamp does
 * to a file, but it works on any pair.
 *
 *     node scripts/compare-pdfs.mjs public/q1-market-report.pdf ~/Downloads/q1-market-report.pdf
 *
 * Get the stamped copy from the app itself: pick a case, turn the stamp on,
 * and use the download button in the details panel — it hands out the stamped
 * file. Comparing against what the app actually produced, rather than a copy
 * of its drawing code, means this cannot drift from the hook.
 *
 * Every row is read from the files, nothing is assumed. See CASE-STAMP.md for
 * what the rows mean, what the stamp is expected to change, and the results
 * of running this over every test file.
 *
 * Attachments here are the ones pdf.js lists — the EmbeddedFiles tree. Audio
 * inside a RichMedia annotation shows up only as that annotation; the app's
 * own reader in PdfAttachments/attachmentStreams.ts is what reads those.
 */

const [originalPath, stampedPath] = process.argv.slice(2);
if (!originalPath || !stampedPath) {
  console.error('Usage: node scripts/compare-pdfs.mjs <original.pdf> <stamped.pdf>');
  process.exit(1);
}

/** Things only visible in the raw bytes: how the file is laid out on disk. */
function fileLayout(bytes) {
  const text = Buffer.from(bytes).toString('latin1');
  const count = (pattern) => (text.match(pattern) ?? []).length;

  // Each saved revision ends in its own %%EOF, so more than one means the
  // file was appended to — a signature is always added that way. The one
  // exception is a linearised file, which has two by construction: the
  // first-page index section ends in its own %%EOF.
  const revisions = count(/%%EOF/g);

  // A signature covers an exact byte range. If that range no longer ends at
  // the end of the file, the signed bytes are not what is in the file now.
  const byteRanges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  let signature = 'none';
  if (byteRanges.length) {
    const [, , , start, length] = byteRanges.at(-1).map(Number);
    signature = start + length === bytes.length
      ? 'range covers the whole file'
      : `BROKEN — range ends at ${start + length}, file is ${bytes.length}`;
  }

  return {
    'Size (bytes)': bytes.length,
    'Header': text.slice(0, 8),
    'Saved revisions (%%EOF)': linearisation(text, bytes.length) === 'yes'
      ? `${revisions} (linearised: 1 is the first-page section)`
      : revisions,
    'Cross-reference': count(/\/Type\s*\/XRef\b/g) ? 'xref stream' : 'xref table',
    'Object streams': count(/\/Type\s*\/ObjStm\b/g),
    'Top-level objects': count(/\d+\s+\d+\s+obj\b/g),
    'Linearised': linearisation(text, bytes.length),
    'Signature': signature,
  };
}

/**
 * Whether the file is linearised in a way a reader will honour. The dictionary
 * alone is not enough: its /L must equal the file length, or pdf.js ignores it
 * — which is what happens once anything is appended after linearising.
 */
function linearisation(text, length) {
  const dict = text.slice(0, 2048).match(/\/Linearized\b[^>]*?\/L\s+(\d+)/);
  if (!dict) return 'no';
  const declared = Number(dict[1]);
  return declared === length ? 'yes' : `stale — /L says ${declared}, file is ${length}`;
}

/** Things read through the parsers: what a reader of the document sees. */
async function documentView(bytes) {
  const doc = await PDF.load(bytes.slice());
  const resolve = (ref) => doc.getObject(ref);

  const js = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const { info } = await js.getMetadata();

  // Attachments by name and a hash of their bytes, so a file that survived
  // by name but not by content still shows up as a difference.
  const attachments = Object.values((await js.getAttachments()) ?? {})
    .map((file) => `${file.filename} ${fingerprint(file.content)}`)
    .sort();

  // Field values rather than just a count: a rewrite that kept the field but
  // dropped what was typed into it should not read as "unchanged".
  const fields = Object.entries((await js.getFieldObjects()) ?? {})
    .map(([name, [field]]) => `${name}=${JSON.stringify(field.value ?? '')}`)
    .sort();

  const target = (item) => describeTarget(js, item);
  const bookmarks = await flattenOutline((await js.getOutline()) ?? [], target);

  const pages = [];
  for (const page of doc.getPages()) {
    const contents = page.dict.get('Contents', resolve);
    const fonts = page.getResources().get('Font', resolve);
    const jsPage = await js.getPage(page.index + 1);

    const text = (await jsPage.getTextContent()).items
      .map((item) => item.str)
      .filter((s) => s.trim());

    // Links carry their target, so a link that survived but now points
    // somewhere else — or nowhere — still counts as a difference.
    const annotations = (await Promise.all((await jsPage.getAnnotations()).map(async (a) =>
      [a.subtype, await target(a), a.fieldName ?? ''].filter(Boolean).join(' ')))).sort();

    const { fnArray } = await jsPage.getOperatorList();
    const images = fnArray.filter((fn) => IMAGE_OPS.has(fn)).length;

    pages.push({
      size: `${Math.round(page.width)} x ${Math.round(page.height)}`,
      rotation: page.rotation,
      contentStreams: contents instanceof PdfArray ? contents.length : contents ? 1 : 0,
      fonts: fonts instanceof PdfDict ? fonts.size : 0,
      images,
      annotations,
      text,
    });
  }

  return {
    summary: {
      'PDF version': info.PDFFormatVersion,
      'Producer': info.Producer ?? '(none)',
      'Modified': info.ModDate ?? '(none)',
      'Pages': pages.length,
      'Attachments': listSummary(attachments),
      'Form fields': listSummary(fields),
      'Bookmarks': listSummary(bookmarks),
    },
    lists: { Attachments: attachments, 'Form fields': fields, Bookmarks: bookmarks },
    pages,
  };
}

const IMAGE_OPS = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);

/** Short, stable hash of some bytes or text — enough to tell two apart. */
function fingerprint(data) {
  return createHash('sha256').update(data).digest('hex').slice(0, 10);
}

/** A list as one comparable cell: how many, and a hash of exactly what. */
function listSummary(items) {
  return items.length ? `${items.length} (${fingerprint(items.join('\n'))})` : '0';
}

/**
 * Where a link or bookmark goes, as a page number rather than an object
 * reference. Saving renumbers every object, so comparing raw references
 * would report every internal link as changed even when it still lands on
 * the same page.
 */
async function describeTarget(js, { url, dest }) {
  if (url) return url;
  if (!dest) return '';
  const explicit = typeof dest === 'string' ? await js.getDestination(dest) : dest;
  if (!explicit) return `unresolved "${dest}"`;
  const [ref, ...view] = explicit;
  const page = typeof ref === 'number' ? ref : await js.getPageIndex(ref);
  return `page ${page + 1} ${JSON.stringify(view)}`;
}

/** Bookmark titles with their targets, nesting shown by indentation. */
async function flattenOutline(items, target, depth = 0) {
  const lines = [];
  for (const item of items) {
    lines.push(`${'  '.repeat(depth)}${item.title} -> ${await target(item)}`);
    lines.push(...await flattenOutline(item.items ?? [], target, depth + 1));
  }
  return lines;
}

/** Items in `after` that `before` does not have, counting repeats. */
function addedText(before, after) {
  const remaining = [...before];
  return after.filter((item) => {
    const at = remaining.indexOf(item);
    if (at === -1) return true;
    remaining.splice(at, 1);
    return false;
  });
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, a, b] of rows) {
    const mark = String(a) === String(b) ? ' ' : '*';
    console.log(`${mark} ${label.padEnd(width)}   ${String(a).padEnd(32)} ${b}`);
  }
}

const original = new Uint8Array(readFileSync(originalPath));
const stamped = new Uint8Array(readFileSync(stampedPath));

const [layoutA, layoutB] = [fileLayout(original), fileLayout(stamped)];
const [viewA, viewB] = await Promise.all([documentView(original), documentView(stamped)]);

console.log(`original: ${originalPath}`);
console.log(`stamped:  ${stampedPath}`);
console.log('Rows marked * differ.');

printTable('FILE LAYOUT', Object.keys(layoutA).map((k) => [k, layoutA[k], layoutB[k]]));
printTable('DOCUMENT', Object.keys(viewA.summary).map((k) => [k, viewA.summary[k], viewB.summary[k]]));
for (const [name, before] of Object.entries(viewA.lists)) {
  printChanges(`${name.toLowerCase()}`, before, viewB.lists[name]);
}

viewB.pages.forEach((after, i) => {
  const before = viewA.pages[i];
  if (!before) return;
  printTable(`PAGE ${i + 1}`, [
    ['Size (pt)', before.size, after.size],
    ['Rotation', before.rotation, after.rotation],
    ['Content streams', before.contentStreams, after.contentStreams],
    ['Font resources', before.fonts, after.fonts],
    ['Images drawn', before.images, after.images],
    ['Annotations', listSummary(before.annotations), listSummary(after.annotations)],
    ['Text items', before.text.length, after.text.length],
  ]);
  printChanges('annotations', before.annotations, after.annotations);
  printChanges('text', before.text, after.text);
});

/** What is only in one side, if anything — the detail behind a * row. */
function printChanges(what, before, after) {
  const added = addedText(before, after);
  const removed = addedText(after, before);
  if (added.length) console.log(`  added ${what}:   ${JSON.stringify(added)}`);
  if (removed.length) console.log(`  REMOVED ${what}: ${JSON.stringify(removed)}`);
}
