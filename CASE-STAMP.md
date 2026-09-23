# The case stamp

A court-filing style header bar drawn across the top of every page when the
stamp toggle is on. The code is `src/hooks/usePdfStamp.ts`.

```text
[ Case CASE-2026-001   Q1 2026 Market Report   Filed: 04/05/2026   Page ID: 1   Page 1 of 5 ]
```

## What it prints

Every field comes from metadata that already existed, so the stamp added no new
fields to `pdf-metadata.json`.

| Field         | Source                             |
| ------------- | ---------------------------------- |
| `Case …`      | `caseNumber`                       |
| Document name | `title`                            |
| `Filed: …`    | `createdDate`, shown as MM/DD/YYYY |
| `Page ID: …`  | `id` (the same on every page)      |
| `Page i of n` | counted from the PDF itself        |

`stampFields()` builds these five strings for one page. The `CaseStamp` type in
`src/types/pdf.ts` names the four metadata fields it reads.

The old one-line stamp read a separate `stampText` field. That field was removed,
since the bar replaced it.

## Why it is drawn into the PDF, not styled with CSS

The bar is not HTML. It is written into the PDF itself, as drawing commands
added to each page's content stream. The viewer (pdf.js) then paints each page
onto a `<canvas>`, so there is no DOM element for a stylesheet to reach. That is
why the bar's size and position are constants in the hook, not CSS.

That is also what makes it a stamp. It travels with the file, so it survives a
download or a print, and the download button hands out this stamped copy. An
HTML overlay styled with CSS would only exist on screen. It would also have to
track zoom, rotation and scrolling for every page.

The units differ too. The constants are PDF points (1/72 inch), measured from
the page's bottom-left corner, and they stay the same at every zoom level. ‼️CSS
pixels are sizes on screen.

| Constant     | Value | Meaning                                                           |
| ------------ | ----- | ----------------------------------------------------------------- |
| `BAR_TOP`    | 18pt  | Gap between the page's top edge and the bar                       |
| `BAR_HEIGHT` | 18pt  | Height of the bar                                                 |
| `BAR_MARGIN` | 20pt  | Gap between the bar and each side edge                            |
| `STAMP_SIZE` | 8pt   | Font size (Helvetica, a Standard 14 font, so nothing is embedded) |

The bar ends 36pt from the top. The tightest test files start their content
44pt down, so the bar covers nothing on any of them.

## How the drawing works

It is all done by [`@libpdf/core`](https://www.npmjs.com/package/@libpdf/core),
in the browser. No server is involved.

| Call            | What it does                               |
| --------------- | ------------------------------------------ |
| `PDF.load`      | Parses the bytes into an editable document |
| `drawRectangle` | Adds the bar to the page's content stream  |
| `drawText`      | Adds each field on top of the bar          |
| `measureText`   | Gives a string's width in points           |
| `save`          | Writes the stamped document back out       |

A few PDF specifics that the code has to handle itself:

- **Draw order is layering.** There is no z-index:‼️ later draws paint over
  earlier ones, so the rectangle is drawn first and the text lands on top.

- **y runs upwards.** The origin is the bottom-left corner, the reverse of the
  DOM. So "18pt from the top" is `page.height - BAR_TOP`, and the bar is placed
  by its bottom edge.
- **There is no layout engine.** A PDF has no flexbox and no text flow, so the
  spacing is worked out by hand. The code measures every field, subtracts their
  total from the bar's width and splits what is left into equal gaps. There is a
  4pt minimum gap. If the fields are too wide for the bar, they run past its
  right edge instead of wrapping.
- **Text is placed by its baseline, not its top.** Capital letters stand about
  0.7 of the font size above the baseline, and the code uses that to centre them
  vertically in the bar.

pdf.js cannot do any of this. It only reads PDFs; it never writes one.

## What it costs in memory

Turning the stamp on produces a second copy of the document.

1. The hook fetches the original's bytes again. This is usually served from the
   browser's HTTP cache.
2. `@libpdf/core` parses them, draws the bar and saves a new byte array.
3. That array is wrapped in a `Blob`, and `URL.createObjectURL` gives the viewer
   a `blob:` URL to load.

**The Blob is the copy that stays in memory.** The original bytes, the parsed
document and the saved array are temporary, and are garbage-collected once
stamping finishes.

**Turning the stamp off releases it.** The effect's cleanup revokes the `blob:`
URL and clears `stampedUrl`. With nothing referencing the Blob, the browser can
free it. The same cleanup runs when the case changes or the page unmounts. The
"blob URL lifecycle" tests in `usePdfStamp.test.ts` cover all three, because
missing this once leaked a whole PDF on every case switch (see `TESTING.md`).

**Turning it back on stamps the file again from scratch.** Nothing is cached
between toggles.

**The original is not held by the app.** The browser's HTTP cache usually has
it, but the browser manages that cache, not our code. The viewer holds only the
version it is currently showing:

| State     | Held in memory                                 |
| --------- | ---------------------------------------------- |
| Stamp off | pdf.js's copy of the original                  |
| Stamp on  | The stamped Blob, plus pdf.js's own copy of it |

**The peak comes while stamping.** The original bytes, the parsed document, the
saved bytes and the Blob all exist at once, so memory briefly reaches roughly
three to four times the file size. That is negligible for the 40 KB reports,
but real for the 28 MB audio test file.‼️

## Why `stamp` must be a stable object

The effect compares `stamp` by reference. If a caller passed an object built
inline on every render, the file would be stamped again on every render. Each
stamp sets state, which causes another render, so it would never stop. The page
passes the case's metadata entry straight from the JSON, which is the same
object every time.

## What stamping changes in the file

The stamp does not touch the original page content, but saving writes a brand
new file, so the structure around that content changes.

Everything below was measured on all 17 files in the case drop-down (35 pages
in total). Each file was stamped with its own case fields, using the hook's
drawing code run in Node, and compared with its original using
`scripts/compare-pdfs.mjs`. Attachments were also read back with the app's own
reader (`collectAttachments` and `readAttachment`), and their bytes were hashed
before and after.

`case-linearized`, the 18th, was added afterwards to test linearisation. It was
checked the same way with `compare-pdfs.mjs` and with qpdf's linearisation
validator, but not with the app's attachment reader.

### On every page

The same on all 35 pages:

- **`/Contents` goes from 1 stream to 9**: the original plus eight new ones.

  ```text
  q  ·  original  ·  Q  ·  rectangle  ·  field 1 … field 5
  ```

- **The original stream is kept byte for byte.** It is wrapped in `q … Q`,
  which saves and restores the drawing state, so any colour or line width it
  sets cannot carry over onto the bar. `q` and `Q` are each a stream of their
  own, which is where the two extra come from.
- **The six drawing streams** are one for the rectangle and one for each of the
  five fields. Streams under 512 bytes are not compressed, so they can be read
  as plain text:

  ```text
  q 0.6 0.6 0.6 RG 0.75 w 0.92 0.92 0.92 rg 20 806 m 575 806 l 575 824 l 20 824 l h B Q
  q 0.2 0.2 0.2 rg BT /F0 8 Tf 1 0 0 1 82.18667 812.2 Tm <436173652058> Tj ET Q
  ```

- **One font resource is added**, `/F0` pointing to Helvetica. Nothing is
  embedded.
- **The stamp is real text.** It can be selected and searched, and pdf.js
  extracts it. It can also be deleted by anyone with a PDF editor, because
  nothing is flattened into an image.

### Across the whole file

- **Objects are renumbered** in every file. For example, the WAV file's page
  went from `5 0 obj` to `3 0 obj`.
- **Object streams are unpacked, and the xref stream becomes a classic xref
  table.** This hit the six files that used them: the three reports,
  `case-document-attachments`, `case-embedded-audio-media` and
  `case-audio-attachment-large`. On the Q1 report the top-level object count
  went from 7 to 55.
- **The size changes.** Most files grow by 1–3 KB, which is the stamp itself.
  The three reports grow by about 9 KB because of the unpacking.
  `case-embedded-audio-media` shrinks by 157 KB, because the rewrite drops its
  two older revisions.
- **The linearisation dictionary is dropped** from `case-embedded-audio-media`,
  the only test file that has one. It was already stale: two revisions had been
  appended after linearising, so pdf.js ignored it anyway. A valid linearised
  file loses it too: this was confirmed on `case-linearized`, which passes
  qpdf's check before stamping and fails it after. See "What linearisation
  is" in `ATTACHMENT-EXTRACTION.md` §5, and [Related](#related).
- **Every saved revision is flattened into one.** That affects two files:
  `case-embedded-audio-media` (3 revisions to 1) and `case-digital-signature`
  (2 to 1), which is what breaks its signature.

### Digital signatures break

This is the one that matters for court filings. A signed PDF is the original
plus an appended revision, and the signature covers an exact byte range of the
file. Stamping flattens both revisions into one new file, so that range no
longer describes it:

```text
Saved revisions (%%EOF)   2                             1
Signature                 range covers the whole file   BROKEN — range ends at 10715, file is 11499
```

A signature validator such as Acrobat's will report it as invalid. Saving with
`save({ incremental: true })` would append the stamp and keep the signed bytes
intact, but a validator would still flag the page content as changed after
signing, and that is exactly what the stamp does.

### What stays the same

In every file: page count, page sizes, rotation, the original text, images,
annotations, attachments, form fields, bookmarks and the PDF version.

The Producer and ModDate fields are also left alone, so the stamped file still
claims it was last modified before it was stamped.

### Each test file's feature

**Only the signature broke.** Every other feature the test files exist to
exercise came through intact:

| Test file                     | What it tests    | After stamping                      |
| ----------------------------- | ---------------- | ----------------------------------- |
| `case-hyperlinks`             | Links            | Both kept, same URL / same page     |
| `case-bookmarks`              | Outline          | All 5 kept, same titles and pages   |
| `case-fillable-form`          | Form fields      | All 6 kept, same values             |
| `case-various-fonts`          | Font types       | Original text identical             |
| `case-legacy-pdf12`           | PDF 1.2          | Still declares `%PDF-1.2`           |
| `case-scanned-document`       | Image-only page  | The scan is still drawn             |
| `case-redaction`              | Redaction        | Original text identical             |
| `case-audio-attachment`       | WAV attachment   | Kept, bytes identical               |
| `case-audio-attachment-mp3`   | MP3 attachment   | Kept, bytes identical               |
| `case-multi-audio`            | 3 audio files    | All 3 kept, bytes identical         |
| `case-audio-attachment-large` | 28 MB audio      | Kept, bytes identical               |
| `case-embedded-audio-media`   | RichMedia audio  | Annotation and MP3 kept, identical  |
| `case-document-attachments`   | Non-audio files  | Both kept, bytes identical          |
| `case-digital-signature`      | Signature        | **Broken** (see above); field kept  |
| `case-linearized`             | Linearisation    | **Lost**; 4 attachments identical   |
| `q1`, `q2`, `h1` reports      | Plain documents  | Original text identical             |

Two things this check cannot see:

- **What it looks like.** The bar clears the content on every text page, but on
  `case-scanned-document` it is drawn over the top of the scanned image.
  Open it in the app to judge that.
- **Behaviour in other readers.** Everything here was read back with pdf.js and
  @libpdf/core. Acrobat, Preview and browsers' built-in viewers were not tried.

A first pass reported every internal link and bookmark as changed. That turned
out to be the renumbering: they pointed at new object numbers for the same
pages. `compare-pdfs.mjs` now resolves each target to a page number, so it only
reports a link or bookmark that actually lands somewhere else.

## Checking it yourself

`scripts/compare-pdfs.mjs` compares any two PDFs and marks every row that
differs. Compare an original with the stamped copy the app produces:

1. Run `npm run dev`, pick a case and turn the stamp on.
2. Use the download button in the details panel. It hands out the stamped copy.
3. Compare the downloaded file with the original in `public/`:

   ```bash
   npm run compare-pdfs -- public/case-digital-signature.pdf ~/Downloads/case-digital-signature.pdf
   ```

The report has three parts:

- **File layout:** size, revisions, cross-reference format, object streams,
  linearisation and signature byte range, read from the raw bytes.
- **Document:** version, Producer, ModDate and page count, plus attachments
  (with a hash of each file's bytes), form fields (with their values) and
  bookmarks (with the page each one opens).
- **Per page:** size, rotation, content streams, font resources, images drawn,
  annotations (links with their URL or target page), and the exact text the
  stamp added or removed.

A list that differs is printed in full underneath its row, so you can see
exactly which link, bookmark or file changed. Anything that went missing is
printed as `REMOVED`.

Using the app's own output means the check cannot drift from the hook.

For a closer look at the raw objects, `qpdf` can rewrite a PDF into a readable
form: `brew install qpdf`, then `qpdf --qdf --object-streams=disable in.pdf
out.pdf`, and open `out.pdf` in a text editor.

## Related

- Saving the stamped copy keeps its attachments but loses linearisation. That is
  one reason the stamp belongs on a server; see "The stamp belongs there too" in
  `ATTACHMENT-EXTRACTION.md`.
