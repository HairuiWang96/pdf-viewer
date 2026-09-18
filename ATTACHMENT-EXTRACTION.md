# Reading attachments — why this moved from pdf.js to pdf-lib

Companion to `ATTACHMENT-INDICATOR.md`. That one is about *where the indicator lives*;
this one is about *where its data comes from*, which changed twice in one sitting and for
two unrelated reasons.

**Summary:** a case PDF turned up whose audio pdf.js cannot see at all. Fixing that meant
reading attachments with pdf-lib instead. Having moved, the same change also let listing
stop decoding files it was never asked for — which matters more in production than the
bug that prompted it.

---

## 1. The document that started it

`case-embedded-audio-media.pdf` (`CASE-TEST-AUDIO-RICHMEDIA`) plays fine in Adobe
Acrobat — click the box on the page and a media player appears. In every viewer branch
here it showed no attachment indicator at all.

Both behaviours are correct. The file is built the Flash way:

```
/Subtype /RichMedia          annotation on page 1
  /RichMediaContent
    /Assets                  a private name tree, NOT the document's attachment tree
      AudioPlayer.swf        62,857 bytes, "FWS" header, authored 2015
      2017-1506.mp3          8,257,667 bytes, ID3v2.3, MPEG-1 layer III
                             22.05 kHz mono, 32 kbps, ~34 minutes
  /FlashVars (source=2017-1506.mp3&autoPlay=true&volume=1.00)
```

The document's catalog has **no `/Names /EmbeddedFiles`** entry whatsoever. So by the PDF
specification's own attachment model, this file has no attachments — and an indicator
showing nothing was telling the truth.

Acrobat plays it anyway because it ignores the dead `.swf` and plays the MP3 itself. The
player is Flash; **the audio is not.** That distinction is the whole reason this was
fixable — the bytes beside the player are an ordinary MP3 that any browser can play.

---

## 2. Two places a PDF can keep a file

This is the fact the original implementation was missing.

| | `/Names /EmbeddedFiles` | RichMedia `/Assets` |
|---|---|---|
| Where it lives | On the catalog, document-wide | Private to one annotation |
| What it means | "This document has attachments" | "This player needs these files" |
| Authored by | Attach-a-file, in any tool | Acrobat's multimedia insert, pre-2015 |
| `getAttachments()` sees it | Yes | **No** |
| Our cases using it | 5 documents | 1 document |
| Shown as | Player or download | Player (audio only) |

We list files from both, but not on the same terms. The attachment tree is taken whole —
if an author attached a `.csv`, they meant it to be there. RichMedia assets are filtered
to audio, because they are a player's internals rather than files anyone chose to attach,
and shipping a `.swf` to a browser as a "download" would be offering someone a file
nothing can open.

---

## 3. Why pdf.js could not do this job

Not a criticism of pdf.js — it is a *renderer*, and neither limitation matters for
rendering.

**It only ever looks at one of the two places.** `getAttachments()` is built purely from
the catalog's attachment tree:

```
case-embedded-audio-media.pdf   getAttachments() -> null
case-multi-audio.pdf            getAttachments() -> [interview-part-1.mp3,
                                                     interview-part-2.mp3,
                                                     voicemail-evidence.wav]
```

**It has no RichMedia support to fall back on.** Asking for the page's annotations gets
the annotation stripped of the very dictionary the audio is named in:

```
annotations: [ { subtype: "RichMedia" } ]
Warning: Unimplemented annotation type "RichMedia", falling back to base annotation.
```

There is no combination of pdf.js calls that reaches those bytes. The content dictionary
is discarded during parsing.

**And, separately: it decodes everything.** `getAttachments()` returns each attachment's
bytes, fully decoded, as the only way to learn that the attachment exists. For a document
carrying a 200 MB video that is 200 MB of memory spent to render a badge reading "1".
This was survivable with the old fixtures — the largest was 45 KB — and is not survivable
with real case files.

---

## 4. Why pdf-lib

pdf-lib is normally described as a PDF *writer* (see `PDF-LIBRARIES.md`), and it is being
used here as a reader. That is deliberate: to write a PDF it has to model the object graph
faithfully, and it exposes that model.

| | pdf.js | pdf-lib |
|---|---|---|
| Reaches `/Names /EmbeddedFiles` | Yes | Yes |
| Reaches RichMedia assets | **No** | Yes |
| Can list a file without decoding it | **No** | Yes |
| Reuses the viewer's existing parse | Yes | No — parses again |
| Already a runtime dependency here | Yes | Yes (`usePdfStamp`) |

The two rows that decided it are the two pdf.js cannot do at all. The row it loses on —
parsing the document a second time — is a real cost, accepted knowingly in §6.

---

## 5. Listing without reading

Having moved to a library that *can* separate discovery from reading, the design took
that split as its centre. An indicator's job is to say a file is there; whether anyone
plays it is a separate question, asked later and usually not at all.

```
collectAttachmentStreams(document)   walks the object graph, stops at the stream object
                                     → filename, declared size, MIME guess
attachment.read()                    decodes exactly one file, on demand
```

Nothing between opening a document and pressing a button touches an attachment's bytes.
The size shown next to each control comes from `/Params /Size` in the stream dictionary —
the decoded length, declared by the document, and free to read.

That size is not decoration. It is the one thing that tells someone whether pressing
**Play** is instant or a 200 MB download, and it is only showable *because* the file has
not been read yet.

---

## 6. What it costs

Stated plainly, because both costs are real and neither is hypothetical.

**One parse per document, always.** Previously, listing attachments rode on the parse the
viewer had already done; a document with no attachments cost nothing. Now every document
is fetched and parsed once by pdf-lib. The fetch is served from the browser's HTTP cache
(the viewer has already requested the same URL), but the parse is genuine extra work.

**A second parse on first play.** `read()` re-fetches and re-parses rather than holding
the discovery parse alive. Holding it would pin the whole document — source bytes
included — in memory for as long as the indicator is on screen, which for a large file is
exactly what this design exists to avoid. The re-parse is shared by every attachment in
that document, so it happens at most once, and only for documents where somebody actually
pressed something.

The trade in one line: **pay a small cost on every document, to avoid a large one on the
documents that matter.**

---

## 7. What changed in the code

| File | Role |
|---|---|
| `attachments.ts` | The lazy `PdfAttachment` shape (`read()`, not `url`), `formatSize` |
| `attachmentStreams.ts` | Walks both sources, decodes nothing |
| `useAttachments.ts` | Lists per document; takes a file path, not a pdf.js document |
| `useAttachmentUrl.ts` | Reads one file on demand, owns its blob URL |
| `AttachmentControl.tsx` | Shared Play/Download control for all three placements |

Removed along the way: the `onDocumentLoad` prop on `KendoPdfViewer`, the
`AttachmentSource` type, and the `pdfDocument` state in `PdfViewerPage`. With pdf.js no
longer the source, that plumbing had nothing left to carry.

The post-click behaviour lives in one shared component rather than three copies. Where the
indicator lives is the open design question; what happens after someone presses Play is
the same answer in all three placements.

### A hazard worth knowing about

`useAttachmentUrl` resets when its attachment's identity changes. The reset originally
called `setState` with a fresh `{ status: 'idle' }`, which defeats React's bail-out — so a
caller rebuilding its attachment objects each render looped forever. It is now a shared
constant, which makes an already-idle reset free. The first test run found this by
exhausting the heap.

---

## 8. Verification

```
case-embedded-audio-media.pdf   2017-1506.mp3 (7.9 MB, audio/mpeg)
case-multi-audio.pdf            interview-part-1.mp3 (26 KB) | interview-part-2.mp3 (26 KB)
                                | voicemail-evidence.wav (138 KB)
case-audio-attachment.pdf       case-note-audio.wav (23 KB)
case-audio-attachment-mp3.pdf   case-note-audio.mp3 (32 KB)
case-document-attachments.pdf   interview-transcript.txt (610 B) | evidence-log.csv (383 B)
the other 11 public PDFs        no attachments — indicator renders nothing
```

The RichMedia MP3 was also extracted and checked against the original: 8,257,669 bytes,
`ID3` header, decoding to valid MPEG audio.

`case-document-attachments.pdf` was built for this work
(`scripts/generate-mixed-attachments.mjs`) because every existing attachment fixture was
audio, leaving the download branch of the indicator unexercised in the browser.

---

## 9. Still open

- **Does the RichMedia case deserve its own indicator wording?** It is currently listed as
  an ordinary attachment, which is a small lie: the author embedded a *player*, and we are
  quietly serving the file out of it.
- **Should non-audio RichMedia assets be reachable at all?** Today they are filtered out
  entirely. A RichMedia video would be silently invisible, exactly as the audio used to be.
- **Is one parse per document acceptable at real file sizes?** The fixtures top out at
  8 MB. Worth measuring against the largest real case file before this ships.
- **Should audio also offer a save, without playing first?** Currently the only route to
  the file is the browser's own player menu, which means loading and playing it.
- **`/Params /Size` is trusted, not verified.** A document declaring a wrong size would
  show a wrong size. Harmless, but it is a claim by the file rather than a measurement.

---

## 10. This branch: the same job with `@libpdf/core`

`libpdf-attachments` is this branch. Everything above still describes *why* the
reading moved off pdf.js; this section records what changed when the reader itself
was swapped for [`@libpdf/core`](https://github.com/LibPDF-js/core), the library a
colleague already uses server-side.

`usePdfStamp` deliberately stays on pdf-lib. That means both libraries ship here,
which would be the wrong call in production and is the right one for a comparison
branch — the point is to see the attachment layer side by side, not to finish a
migration.

### What got better

| | pdf-lib branch | this branch |
|---|---|---|
| `/EmbeddedFiles` | hand-walked name tree, ~60 lines | `pdf.getAttachments()` — one call |
| MIME type | guessed from the file extension | **declared by the document** (`/Subtype`) |
| Also free | — | description, creation and modification dates |
| Dereferencing | manual, easy to forget | every typed getter takes a resolver |
| Encrypted PDFs | **cannot open them at all** | `PDF.load(bytes, { credentials })` |

The MIME row is the visible one: `interview-transcript.txt` now reports `text/plain`
and `evidence-log.csv` reports `text/csv` because the file says so, where the pdf-lib
branch only knew they were "not audio".

### What did not change

RichMedia still needs the low-level walk. `getAnnotations()` models a fixed set of
subtypes and RichMedia is not among them, so the page comes back empty — the same
blind spot pdf.js has, reached the same way, through `PdfDict`/`PdfArray`. Listing
without decoding also survives: `getAttachments()` is metadata-only and `PdfStream.data`
hands back raw bytes.

### What it costs

`usePdfStamp` was ported too, so pdf-lib is gone from the bundle — verified, not
assumed: `PDFHexString`, `PDFRawStream`, `PDFArray` and `decodePDFRawStream` all
appear zero times in the built JS. It stays a devDependency, used only by the
fixture scripts and the unit tests, neither of which is bundled.

That makes the bundle comparison a fair one, and it does not say what was expected:

| Bundle | raw | gzip |
|---|---|---|
| pdf-lib only (`pdf-lib-attachments`) | 2,769 kB | 897 kB |
| both libraries | 3,733 kB | 1,143 kB |
| **`@libpdf/core` only (this branch)** | **3,311 kB** | **967 kB** |

**`@libpdf/core` is the bigger library here — +541 kB raw, +70 kB gzip over pdf-lib.**
An earlier note in this file predicted dropping pdf-lib would turn the size into a win.
It does not, and that prediction was wrong.

The reason is visible in the output: `pkijs`, `SignedData` and `OCSPResponse` are all
in the bundle. That is the digital-signature and certificate-validation machinery,
which this app never touches — it is not being tree-shaken away, most likely because
the `PDF` class reaches its signing methods. So the overhead is not inherent to
reading attachments; it is unused functionality that a future version, or an upstream
issue about side-effect-free signing imports, could remove.

Two other costs:

- **`@libpdf/core` is 0.4.2 and self-describes as beta**, with a pre-1.0 API that will
  move. This is the layer the viewer's correctness rests on.
- **Against that, pdf-lib's last release was 1.17.1 on 2021-11-06** — nearly five years
  ago. "Stable versus beta" is the wrong frame for that pair; it is closer to
  "unmaintained versus young".

### Verified

Identical results to the pdf-lib branch on every fixture, byte for byte — including
`2017-1506.mp3` at 8,257,667 bytes out of the RichMedia annotation. The unit tests
build fixtures with pdf-lib and read them with `@libpdf/core`, so the reader is never
checked against its own writer.
