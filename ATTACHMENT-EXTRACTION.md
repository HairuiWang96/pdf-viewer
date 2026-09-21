# Reading attachments — why this moved off pdf.js

Companion to `ATTACHMENT-INDICATOR.md`. That one is about _where the indicator lives_;
this one is about _where its data comes from_, which changed twice in one sitting and for
two unrelated reasons.

**Summary:** a case PDF turned up whose audio pdf.js cannot see at all. Fixing that meant
reading attachments with a library that exposes the PDF object graph instead. Having
moved, the same change also let listing stop decoding files it was never asked for —
which matters more in production than the bug that prompted it.

**On this branch that library is `@libpdf/core`, and pdf-lib is not used at runtime.**
Sections 1–9 were written when it was pdf-lib, and the reasoning is unchanged by the
swap — both are writers being used as readers, for the reason in §4. Where a section
names pdf-lib it is describing that first move; §10 records the second.

---

## 1. The document that started it

`case-embedded-audio-media.pdf` (`CASE-TEST-AUDIO-RICHMEDIA`) plays fine in Adobe
Acrobat — click the box on the page and a media player appears. In every viewer branch
here it showed no attachment indicator at all.

Both behaviours are correct. The file is built the Flash way:

```
/Subtype /RichMedia          annotation on page 1
  /RichMediaContent
    /Assets                  a private name tree, NOT the document's attachment tree‼️
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

|                            | `/Names /EmbeddedFiles`         | RichMedia `/Assets`                   |
| -------------------------- | ------------------------------- | ------------------------------------- |
| Where it lives             | On the catalog, document-wide   | Private to one annotation             |
| What it means              | "This document has attachments" | "This player needs these files"       |
| Authored by                | Attach-a-file, in any tool      | Acrobat's multimedia insert, pre-2015 |
| `getAttachments()` sees it | Yes                             | **No**                                |
| Our cases using it         | 5 documents                     | 1 document                            |
| Shown as                   | Player or download              | Player (audio only)                   |

We list files from both, but not on the same terms. The attachment tree is taken whole —
if an author attached a `.csv`, they meant it to be there. RichMedia assets are filtered
to audio, because they are a player's internals rather than files anyone chose to attach,
and shipping a `.swf` to a browser as a "download" would be offering someone a file
nothing can open.

### The graph the code navigates

Two entry points, one destination. Every `─→` below is an **indirect reference**, which
is why a `resolve` function is threaded through every lookup in `attachmentStreams.ts`:
without it, each of these hops returns a `PdfRef` rather than the object itself.

#### Where both entry points come from

Neither the Catalog nor a Page is the top. ‼️Reading a PDF starts at the **end** of the
file and works backwards — the trailer names the Catalog, and everything else hangs off
it. Traced from `case-embedded-audio-media.pdf`:

```text
%PDF-1.7                                    ← header, first 8 bytes of the file
    …objects…
    xref stream                             ← where every object lives (PDF 1.5+)
    trailer
    └── /Root  ─→  Catalog                  ← the document, and the only way in
                   ├── /Lang /Metadata /StructTreeRoot /MarkInfo /PageLayout
                   │
                   ├── /Names ─────────────→  ENTRY POINT 1  (attachments)
                   │
                   └── /Pages  ─→  page tree      /Type /Pages · /Count 1
                                   └── /Kids  [ Page ]
                                                └── /Annots ──→  ENTRY POINT 2
```

Two things worth noting. The page tree is a _tree_, not a list — `/Kids` can hold more
`/Pages` nodes, and only the leaves are `/Type /Page` — which is why the code says
`pdf.getPages()` and lets the library flatten it. And a Page carries `/Parent` back up,
so the graph has cycles; anything walking it by hand has to not follow them.

`pdf.getCatalog()` and `pdf.getPages()` are the two calls in `attachmentStreams.ts` that
start from here. Everything below is reached from one of them.

#### Entry point 1 — the catalog's attachment tree

```text
Catalog
└── /Names
    └── /EmbeddedFiles
        └── /Names  [ key, <filespec>, key, <filespec>, … ]
                             │
                             └──→ filespec
```

#### Entry point 2 — a RichMedia annotation's private assets

```text
Page
└── /Annots  ─→  [ annotation, … ]
                  └── /Subtype /RichMedia              ← the marker we filter on
                      └── /RichMediaContent  ─→  dict
                          └── /Assets  ─→  name tree
                              └── /Names  [ key, <filespec>, … ]
                                                 │
                                                 └──→ filespec
```

#### Both arrive at the same place

```text
filespec
├── /UF   "2017-1506.mp3"        ← the name    (/F is the legacy fallback)
└── /EF
    └── /F  ─→  stream
                │
                ├── DICTIONARY — free to read, and all listing needs
                │   ├── /Subtype       /audio#2Fmpeg     → MIME type
                │   ├── /Params /Size  8257667           → real, decoded size
                │   └── /Filter        …                 → present if encoded
                │
                └── BODY — 8 MB of MP3
                    └── read ONLY when someone presses Play
```

**That split is the whole design.** `/Subtype`, `/Params` and `/Filter` live in the
stream's _dictionary_, which costs nothing to reach — so an indicator can name a file,
size it, and decide whether it is playable **without ever opening it**. Only the body is
expensive, and only a click asks for it.

Two details that cause most of the code:

- **A name tree is not a list.** It is either flat — `/Names`, a single array
  alternating key and value, so the file specifications are the _odd_ indices — or
  branching, via `/Kids`, recursively. The spec permits both on the same node, so
  `collectFileSpecs` reads each independently rather than as alternatives.
- **The two entry points converge.** Both end at a file specification with an `/EF`
  stream, so `eachFile` walks them into one sequence and everything downstream —
  naming, sizing, filtering, decoding — is shared.

---

## 3. Why pdf.js could not do this job

Not a criticism of pdf.js — it is a _renderer_, and neither limitation matters for
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

### It is not RichMedia specifically — pdf.js implements no media annotations at all‼️

Its annotation factory handles these eighteen subtypes and nothing else:

```text
Link, Text, Widget (Tx/Btn/Ch/Sig), Popup, FreeText, Line, Square, Circle,
PolyLine, Polygon, Caret, Ink, Highlight, Underline, Squiggly, StrikeOut,
Stamp, FileAttachment
```

Everything else reaches the default branch, verbatim from the source:

```js
warn(`Unimplemented annotation type "${subtype}", falling back to base annotation.`);
```

`RichMedia`, `Screen`, `Movie` and `Sound` are all absent — zero occurrences anywhere in
the worker. So this is a category decision rather than an oversight about one format, and
a defensible one:

1. **pdf.js is a renderer.** Its job is turning a PDF into pixels. Playing media needs a
   media runtime,‼️ which is outside that job.
2. **RichMedia's player is Flash**, and no browser has had Flash since December 2020.‼️
   pdf.js cannot run the thing the annotation points at even if it parsed it.
3. **Adobe deprecated the format themselves.** Implementing a dead Flash-based mechanism
   is a poor use of anyone's time.

It also means the other three mechanisms in §12 are unreachable through pdf.js for the
same reason, not for four separate ones.

The part worth holding onto: **Flash is only the player.** The audio beside it is an
ordinary MP3, which is why Acrobat plays this file and why we can too.

**And, separately: it decodes everything.** `getAttachments()` returns each attachment's
bytes, fully decoded, as the only way to learn that the attachment exists. For a document
carrying a 200 MB video that is 200 MB of memory spent to render a badge reading "1".
This was survivable with the old fixtures — the largest was 45 KB — and is not survivable
with real case files.

---

## 4. Why a PDF _writer_, used as a reader

The library that replaced pdf.js here was pdf-lib first and `@libpdf/core` now, and the
argument is the same for both: they are normally described as PDF _writers_ (see
`PDF-LIBRARIES.md`), and they are being used as readers on purpose. To write a PDF, a
library has to model the object graph faithfully — and having modelled it, it exposes
it. A renderer has no such obligation and discards what it cannot draw.

The comparison below is against pdf-lib, the first replacement. §10 carries the same
table for `@libpdf/core`.

|                                     | pdf.js | pdf-lib             |
| ----------------------------------- | ------ | ------------------- |
| Reaches `/Names /EmbeddedFiles`     | Yes    | Yes                 |
| Reaches RichMedia assets            | **No** | Yes                 |
| Can list a file without decoding it | **No** | Yes                 |
| Reuses the viewer's existing parse  | Yes    | No — parses again   |
| Already a runtime dependency here   | Yes    | Yes (`usePdfStamp`) |

The two rows that decided it are the two pdf.js cannot do at all. The row it loses on —
parsing the document a second time — is a real cost, accepted knowingly in §6.

---

## 5. Listing without reading

Having moved to a library that _can_ separate discovery from reading, the design took
that split as its centre. An indicator's job is to say a file is there; whether anyone
plays it is a separate question, asked later and usually not at all.

```text
collectAttachments(pdf)     walks the object graph, stops at the stream dictionary
                            → filename, declared size, declared MIME type
attachment.read()           decodes exactly one file, on demand
```

Nothing between opening a document and pressing a button touches an attachment's bytes.
The size shown next to each control comes from `/Params /Size` in the stream dictionary —
the decoded length, declared by the document, and free to read.

That size is not decoration. It is the one thing that tells someone whether pressing
**Play** is instant or a slow wait, and it is only showable _because_ the file has not
been read yet.

### What laziness does not save: the download

Easy to misread, so stated plainly. **The whole PDF is downloaded before any of this
runs, whether or not anyone ever presses Play.**

```ts
const response = await fetch(filePath);
return PDF.load(new Uint8Array(await response.arrayBuffer()));
```

`arrayBuffer()` waits for the entire file. A document with a 200 MB attachment is a
200 MB download the moment it is opened, and `PDF.load` does not begin until the last
byte has arrived. Nothing here streams, and nothing here fetches part of a file.

So the split is:

|                   | Bandwidth                | Memory                       |
| ----------------- | ------------------------ | ---------------------------- |
| Opening the file  | **the whole file**       | the file's bytes             |
| Parsing + listing | none                     | ~0 — dictionary entries only |
| Pressing Play     | none, if the cache holds | **decode + Blob copy**       |

**Laziness saves memory, not bandwidth.** What it avoids is the further decoding and
copying — roughly another 2× the attachment's size — for a file nobody asked to hear.
On the 28 MB fixture that is 59 MB and 203 ms not spent unless someone clicks.

This is also why a large case file feels slow to open on a poor connection even though
listing is free: the wait is over before our code runs at all. Pressing Play re-fetches
for the second parse, but that is normally served from the browser's HTTP cache, so it
costs memory rather than bandwidth — on a cache miss it would be a second real download.

Fetching _less_ than the whole file would need HTTP range requests against the byte
ranges the xref points at. Possible in principle, and a much larger piece of work — and
it would not help the common case anyway, since the viewer has to download the entire
document to render it regardless.

---

## 6. What it costs

Stated plainly, because both costs are real and neither is hypothetical.

**One parse per document, always.** Previously, listing attachments rode on the parse the
viewer had already done; a document with no attachments cost nothing. Now every document
is fetched and parsed once by our own reader. The fetch is served from the browser's cache
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

| File                    | Role                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| `attachments.ts`        | The lazy `PdfAttachment` shape (`read()`, not `url`), `formatSize` |
| `attachmentStreams.ts`  | Walks both sources, decodes nothing                                |
| `useAttachments.ts`     | Lists per document; takes a file path, not a pdf.js document       |
| `useAttachmentUrl.ts`   | Reads one file on demand, owns its blob URL                        |
| `AttachmentControl.tsx` | Shared Play/Download control for all three placements              |

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

### How much this evidence is worth

Less than the list above suggests. **Only two fixtures are real documents:**

| | Version | Structure | Producer |
| ------------------------------- | ------- | --------------------- | ---------------------- |
| `case-embedded-audio-media.pdf` | 1.7     | xref stream + objstm  | Adobe PDF Library 15.0 |
| `case-audio-attachment-large.pdf` | 1.6   | xref stream + objstm  | Adobe PDF Library 26.1 |

Every other fixture is pdf-lib output — one writer, so they are not independent
evidence. `case-legacy-pdf12.pdf` only *declares* `%PDF-1.2` in its header; underneath
it is still pdf-lib, so it says nothing about how 1.2-era tools really wrote files.
The generated set is good for pinning specific structures on demand — a branching name
tree, a missing `/Params /Size` — and poor at telling us what real documents look like.

**The risk is the producer, not the version.** Version differences are almost entirely
structural — xref tables versus streams, object streams, encryption — and none of that
reaches this module, because `@libpdf/core` has already resolved it by the time we walk
anything. What we depend on is a narrow and old surface: `/Names /EmbeddedFiles` and the
filespec shape (PDF 1.3, 1999), name trees, and `/RichMediaContent /Assets`, which
cannot appear in an older file anyway. The one version-sensitive point is `/UF`, added
in 1.7, and `fileSpecName` already falls back to `/F`.

Acrobat, Word, Ghostscript, scanners and recording systems all emit structurally
different but perfectly valid PDFs, and that spread is far wider than the version
number. A few more real files from different producers would be worth more than any
number of generated ones — the two we have are the only fixtures that have found
anything.

---

## 9. Still open

- **Does the RichMedia case deserve its own indicator wording?** It is currently listed as
  an ordinary attachment, which is a small lie: the author embedded a _player_, and we are
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

`libpdf-attachments` is this branch. Everything above still describes _why_ the
reading moved off pdf.js; this section records what changed when the reader itself
was swapped for [`@libpdf/core`](https://github.com/LibPDF-js/core), the library a
colleague already uses server-side.

**pdf-lib is not used at runtime on this branch at all.** `usePdfStamp` was ported
too, so nothing in `src/` imports it and nothing of it reaches the bundle. It remains
a devDependency, used by the fixture scripts and the unit tests — neither of which is
bundled — and that is deliberate rather than leftover: the tests write documents with
one library and read them with the other, so the reader is never checked against its
own writer.

### What got better

|                  | pdf-lib branch                  | this branch                               |
| ---------------- | ------------------------------- | ----------------------------------------- |
| MIME type        | guessed from the file extension | **declared by the document** (`/Subtype`) |
| Dereferencing    | manual, easy to forget          | every typed getter takes a resolver       |
| Encrypted PDFs   | **cannot open them at all**     | `PDF.load(bytes, { credentials })`        |
| `/EmbeddedFiles` | hand-walked name tree           | hand-walked name tree — see below         |

The MIME row is the visible one: `interview-transcript.txt` now reports `text/plain`
and `evidence-log.csv` reports `text/csv` because the file says so, where the pdf-lib
branch only knew they were "not audio".

### The convenience API that had to be given back

`pdf.getAttachments()` replaced the hand-walked name tree for a while: one call,
and description and timestamps reported for free. A measurement ended that. Asked
about a compressed attachment that declares no `/Params /Size`, it decodes the whole
file to find the size out:

```
200 MB compressed, /Params /Size declared:      0 MB,   0 ms
200 MB compressed, not declared:              382 MB, 239 ms
```

382 MB of memory to render a badge is the precise thing this module exists to
prevent, so the walk came back — about sixty lines, and listing is free again at
every size. Nothing displayed the description or the dates, so nothing was lost.

`getAttachment()` is unused too: reading now goes through the same walk as RichMedia,
which also removes a latent bug, since that API is keyed by the name-tree key and we
had been passing it a filename.

**A file whose size cannot be known is now reported as unknown.** `/Length` is the
_encoded_ length, so it stands in for the real size only on an uncompressed file. A
compressed 200 MB attachment has a `/Length` of 2.4 MB, and showing "2.4 MB" against
a file that takes 200 MB to open is worse than showing nothing — so that case reports
null and the control omits the size.

### What did not change

RichMedia still needs the low-level walk. `getAnnotations()` models a fixed set of
subtypes and RichMedia is not among them, so the page comes back empty — the same
blind spot pdf.js has, reached the same way, through `PdfDict`/`PdfArray`. Listing
without decoding also survives: `PdfStream.data` hands back raw bytes.

### Where the RichMedia knowledge actually comes from

Worth stating because it is the opposite of the natural assumption, and because the
question has already been asked once: **`@libpdf/core` has no RichMedia support.
Nothing audio-related at all.** Searching its API documentation for any of this finds
nothing, because there is nothing to find.

No PDF library models RichMedia. That is the whole reason this module exists, and it
means no upstream release will ever improve the situation.

The work splits in two, and only one half is the library's:

| | Source |
| ------------------------------------------------- | ------------------------------------------------ |
| Parsing — xref, objects, object streams, decryption | **`@libpdf/core`** |
| Object access — `PdfDict`, `PdfArray`, `PdfStream`, reference resolution | **`@libpdf/core`**, and entirely generic |
| Which key to follow next — `/RichMediaContent`, `/Assets`, `/EF`, `/UF`, `/Params /Size` | **the PDF specification**, plus reading a real file |

The library hands over dictionaries and arrays and has no idea what any particular key
means. The route through them is ours.

Those key names come from ISO 32000 for the most part, and from Adobe's PDF 1.7
ExtensionLevel 3 for RichMedia itself. In practice the route was confirmed the empirical
way: dumping the objects of `case-embedded-audio-media.pdf` with `zlib` and a regex, and
reading the structure off the output —

```text
/Subtype/RichMedia ... /RichMediaContent 41 0 R
/Assets ... /Names[(2017-1506.mp3) 50 0 R (AudioPlayer.swf) 45 0 R]
/FlashVars(source=2017-1506.mp3&autoPlay=true&volume=1.00)
```

— before any library was involved at all.

One practical note for anyone extending this: the published README is not the API
surface. `node_modules/@libpdf/core/dist/index.d.mts` is, and it is considerably more
complete — every signature used here was read from it, including the exact
`RefResolver = (ref: PdfRef) => PdfObject | null` that a first attempt got wrong.

**The maintenance consequence.** This walk depends on the low-level object API keeping
its present shape. It is a pre-1.0 library, that API is lower-level than most consumers
touch, and there is no RichMedia feature upstream whose tests would protect us. Our own
fixtures are the only thing that catches a break.

### Libraries that _do_ support RichMedia explicitly

They exist. The split is not technical — it is commercial.

| Library | RichMedia | Browser | Licence |
| ------- | --------- | ------- | ------- |
| [Apryse / PDFTron](https://apryse.com/blog/annotation/working-with-pdf-richmedia-annotations) | explicit — `getRichMediaFile()` extracts the media | yes, WebViewer | commercial |
| [Nutrient / PSPDFKit](https://www.nutrient.io/guides/web/annotations/introduction-to-annotations/media-annotations/) | explicit — hands audio/video to the system player | yes | commercial |
| [MESCIUS DsPdf](https://developer.mescius.com/document-solutions/javascript-pdf-api/docs/features/annotations/richmedia-annotation) | explicit — `RichMediaAnnotation` class | yes | commercial |
| [Aspose.PDF](https://reference.aspose.com/pdf/net/aspose.pdf.annotations/richmediaannotation/) | explicit | .NET | commercial |
| [iText 5](https://api.itextpdf.com/iText5/java/5.5.12/com/itextpdf/text/pdf/richmedia/RichMediaAnnotation.html) | explicit, built to Adobe's ISO 32000 supplement §9.6 | Java | AGPL / commercial |
| pdf.js, pdf-lib, `@libpdf/core`, PDFBox | none | — | open source |

**Every library with explicit support is a paid product, and no open-source library has
any.** That is the whole reason this module exists, and it is worth knowing before
anyone concludes the walk was avoidable.

Two details worth carrying into a build-or-buy conversation:

- **Apryse does exactly what we do.** Its documented approach is to iterate a page's
  annotations, find the RichMedia one, and extract the media to a file. The algorithm is
  the same; what you are buying is that someone else maintains it.
- **Most of these are stronger at _creating_ RichMedia than reading it.** Extraction is
  the rarer feature, and Apryse is the clearest that it supports it.

The PDF Association keeps a [RichMedia working repository](https://github.com/pdf-association/PDF-RichMedia-Annotations),
which suggests the specification side is still being tidied up in the post-Flash era.

### What it costs

`usePdfStamp` was ported too, so pdf-lib is gone from the bundle — verified, not
assumed: `PDFHexString`, `PDFRawStream`, `PDFArray` and `decodePDFRawStream` all
appear zero times in the built JS. It stays a devDependency, used only by the
fixture scripts and the unit tests, neither of which is bundled.

That makes the bundle comparison a fair one, and it does not say what was expected:

| Bundle                                | raw          | gzip       |
| ------------------------------------- | ------------ | ---------- |
| pdf-lib only (`pdf-lib-attachments`)  | 2,769 kB     | 897 kB     |
| both libraries                        | 3,733 kB     | 1,143 kB   |
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

### A third option: the maintained pdf-lib fork

Found while surveying the JavaScript field, and it weakens the argument above.
[`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib) is a fork of pdf-lib under
the same MIT licence, at 122 releases with the latest on 2026-09-15 — actively
maintained where the original is not. Every one of the nine exports the
`pdf-lib-attachments` branch uses is present: `PDFDocument`, `PDFDict`, `PDFName`,
`PDFArray`, `PDFRawStream`, `PDFHexString`, `PDFString`, `PDFNumber`,
`decodePDFRawStream`. Changing that branch over looks like an import change, not a port.

So the real choice is three-way, not two:

| | Bundle | Maintained | Encryption | Risk |
| --------------------- | -------- | ---------- | ---------- | ------------------- |
| pdf-lib               | 2,769 kB | **no**     | no         | frozen since 2021   |
| `@cantoo/pdf-lib`     | ~2,769 kB, untested | yes | no | small fork, one team |
| `@libpdf/core`        | 3,311 kB | yes        | **yes**    | pre-1.0 API churn   |

The fork removes the strongest argument for `@libpdf/core` — that pdf-lib is abandoned.
What survives for `@libpdf/core` is encryption, which pdf-lib and its forks cannot do at
all, and declared MIME types. What survives against it is 541 kB and a pre-1.0 API.

Not tested here beyond the export check; the bundle figure is assumed from pdf-lib, not
measured. Worth doing before any decision rests on it.

### The rest of the JavaScript field

For completeness, since the question "what else could do this" has a short answer:

| Library | Browser | Object graph | Licence |
| ------------- | ---------- | --------------- | ------- |
| `mupdf` (WASM) | yes | yes | **AGPL** — likely a blocker for commercial use |
| pdf.js | yes | **no** — discards what it cannot render | Apache |
| jsPDF, PDFKit | — | write-only, cannot read an existing file | MIT |
| muhammara | **no**, Node only | yes | Apache |

That is essentially the whole field. The requirement is only "exposes the raw object
graph", which any library that can _write_ PDFs must do — a writer has to model the
structure, while a renderer is free to throw away what it cannot draw. pdf.js is the
only one here that fails on capability rather than on licence or platform.

### Verified

Identical results to the pdf-lib branch on every fixture, byte for byte — including
`2017-1506.mp3` at 8,257,667 bytes out of the RichMedia annotation. The unit tests
build fixtures with pdf-lib and read them with `@libpdf/core`, so the reader is never
checked against its own writer.

---

## 11. How big can an attachment be?

There is no limit in the PDF format and none in this code. The ceiling is memory, and
where it sits depends entirely on the device.

### Measured

Node 22 / V8 on macOS, one process per row, RSS deltas per phase. **This is not a
browser** — see the caveat below — but it is the same engine doing the same work, so
the shape of the cost is real even where the absolute numbers are not.

Uncompressed attachments, which is what encoded audio and video always are:

| Attachment | fetch  | `PDF.load` | list | read | Blob   | peak RSS |
| ---------- | ------ | ---------- | ---- | ---- | ------ | -------- |
| 10 MB      | 20 MB  | 0          | 0    | 0    | 10 MB  | 239 MB   |
| 50 MB      | 94 MB  | 0          | 0    | 0    | 50 MB  | 301 MB   |
| 200 MB     | 400 MB | 0          | 0    | 0    | 200 MB | 799 MB   |

Three things worth reading off that table:

- **`PDF.load` costs nothing.** It parses lazily off the buffer rather than copying it.
- **Listing costs nothing, at any size.** 0 MB and 0 ms for 10 MB and for 200 MB alike.
  That is the design's central claim, and it holds for compressed files too since the
  size fix in §10.
- **The cost is all in `fetch` and the Blob**, both of which only happen because
  somebody pressed a control.

**Rule of thumb: peak ≈ 4× the attachment size**, once a file is actually played —
the fetched PDF, the Blob copy, and the garbage in between.

Time is negligible for stored files (load 1–3 ms, read ~0 ms at 200 MB) because
decoding an unfiltered stream is a slice, not a decompression. A _compressed_ 200 MB
attachment takes ~250 ms to decode, which is real but only paid on play.

### Not measured — and this is the part that decides real limits

Every number above is Node. None of it tells you what a phone will do, and the phone
is the binding constraint. What is **expected** rather than verified:

| Environment              | Expected ceiling                                | Confidence                             |
| ------------------------ | ----------------------------------------------- | -------------------------------------- |
| Desktop Chrome / Edge    | ~4 GB per tab; 200 MB comfortable               | high                                   |
| Desktop Firefox / Safari | similar order; untested here                    | medium                                 |
| **Mobile Safari**        | **tabs killed in the low hundreds of MB total** | high that a limit exists, low on where |
| Mobile Chrome (Android)  | lower than desktop, device-dependent            | low                                    |
| Any engine, hard cap     | ~2 GB per ArrayBuffer on 64-bit                 | high, but unreachable in practice      |

The mobile row is the one to take seriously. A 200 MB attachment that is fine on a
laptop can kill a tab on a phone, and the failure mode is not an exception this code
can catch — the tab simply dies. `useAttachmentUrl` reports a failed _read_; it cannot
report a process the OS took away.

### What to actually test on a device

The fixtures top out at 8.3 MB (`case-embedded-audio-media.pdf`), so none of this is
exercised today. Worth building a ladder — 10 MB, 50 MB, 200 MB — and checking, per
browser and per device class:

1. Does the **indicator** appear promptly? It should, at every size, since listing is
   free — if it stalls, laziness has regressed somewhere.
2. Does **Play** work, and how long between the press and audio?
3. Does the tab **survive** it, and survive switching to another case afterwards?
4. Does the Blob get **released**? Play, switch documents, repeat — memory should not
   climb. `useAttachmentUrl` revokes on unmount, and nothing in Node proves it worked.
5. On mobile specifically: does **backgrounding the tab** during playback lose the blob?

See `TESTING.md` for why none of this can live in the suite.

---

## 12. Open research: the other four ways a PDF can hold audio

**Nothing here is implemented. This section exists to be taken to a product owner.**

The RichMedia document in §1 was not an exotic one-off — it was the second of _six_
mechanisms the PDF specification provides for embedding sound, and we support two. The
other four were probed by building a minimal fixture for each and running the shipped
reader against it. Those fixtures were throwaway and are not in `public/`; building them
again is an afternoon, not a project.

```
1. /Names /EmbeddedFiles      -> interview-part-1.mp3, interview-part-2.mp3, voicemail-evidence.wav
2. /FileAttachment annot      -> NOT FOUND
3. /Sound annot (PDF 1.2)     -> NOT FOUND
4. /Movie annot (PDF 1.2)     -> NOT FOUND
5. /Screen + Rendition (1.5)  -> NOT FOUND
6. /RichMedia (Flash)         -> 2017-1506.mp3
```

| #   | Mechanism                    | Era      | Where the audio lives                         | Supported |
| --- | ---------------------------- | -------- | --------------------------------------------- | --------- |
| 1   | `/Names /EmbeddedFiles`      | 1.3+     | Catalog name tree → filespec → stream         | **Yes**   |
| 2   | `/FileAttachment` annotation | 1.3+     | Annotation `/FS` → filespec                   | No        |
| 3   | `/Sound` annotation          | 1.2      | Raw samples in a stream — no container        | No        |
| 4   | `/Movie` annotation          | 1.2      | `/Movie /F` → filespec                        | No        |
| 5   | `/Screen` + Rendition        | 1.5      | `/Rendition` → `/MediaClip` → `/D` → filespec | No        |
| 6   | `/RichMedia` annotation      | 1.7 Ext3 | Annotation `/Assets` name tree                | **Yes**   |

Two further cases were not probed: **Sound and Rendition _actions_**, hung off a link or
button rather than an annotation, and **`/AF` associated files** (PDF 2.0), which in
practice also appear in the `/EmbeddedFiles` tree and so are already caught by #1.

### What each gap is worth

**#5 `/Screen` + Rendition is the one that matters.** It is the standard mechanism for
embedded media from PDF 1.5 until RichMedia — roughly 2003 to 2020, and the non-Flash
route throughout that window. A real case file with audio in it is more likely to use
this than RichMedia. Structurally it is the closest to what already works: an annotation
pointing at a filespec with an `/EF` stream, so the existing walk extends to it rather
than needing new machinery.

**#2 `/FileAttachment` is less alarming than the table suggests.** Acrobat writes the
annotation _and_ an `/EmbeddedFiles` entry for the same file, so real documents are
normally caught by #1. Only a tool that writes the annotation alone slips through. The
fixture that failed above was built deliberately pathological to prove the gap exists.
Cheap to close alongside #5, since the shape is nearly identical.

**#3 `/Sound` is a different kind of problem.** The stream holds raw PCM or µ-law
samples with sample rate, channel count and bit depth in the dictionary — **not a
playable file, and carrying no filename.** Supporting it means synthesising a WAV
container from those fields and inventing a name to show. That is real work rather than
an extension of the walk, and it is 1.2-era, so it should probably be an explicit
_won't_ rather than a backlog item.

**#4 `/Movie`** is the same era and effectively extinct.

### The question for the product owner

The failure mode is the one you already saw: the document plainly contains audio, and
the viewer says nothing. It is silent, it looks like nothing is wrong, and no error is
logged — which is exactly why it went unnoticed until someone opened that file in
Acrobat and compared.

So the decision is not really "which of these should we build". It is:

1. **What actually arrives?** Nobody has sampled the real corpus. The cheapest next step
   by a wide margin is to run a scan over real case files counting which of the six
   mechanisms appear, before any of this is built. Six-of-six coverage is pointless if
   the corpus is 99% #1.
2. **Is silence acceptable when we cannot read one?** Today an unsupported mechanism is
   indistinguishable from a document with no audio. An alternative is to detect the
   annotation subtypes we cannot read and say so — "this document contains media this
   viewer cannot play" — which is far cheaper than supporting them and removes the
   dangerous part, which is not knowing.

Point 2 is worth raising first. It is small, it closes the whole class rather than one
case at a time, and it converts a silent gap into a visible one.
