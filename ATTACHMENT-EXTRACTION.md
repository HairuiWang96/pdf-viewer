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

It would not help playback either, and the reason is in how the audio is stored. Every
embedded audio file in the fixtures is Flate-compressed:

```text
case-audio-attachment-large   /FlateDecode   29,728,354 → 29,674,041 bytes   (0.2% saved)
case-audio-attachment-mp3     /FlateDecode
case-multi-audio  (all 3)     /FlateDecode
case-embedded-audio-media     no filter      the RichMedia MP3, stored raw
```

A Flate stream can only be decompressed from its first byte, so reaching minute twenty
means fetching and inflating everything before it — a byte range from the middle is
useless. The compression buys nothing in exchange: MP3 is already compressed, so the
28 MB file shrinks by 0.2%.

The raw RichMedia stream is the exception: a range of the PDF there really is a range of
the MP3. Even then an `<audio>` element cannot be pointed at "bytes X to Y of case.pdf",
so something still has to serve the audio at its own URL — which is §13's proposal.

**In short, what range requests could and could not do for a PDF with audio in it:**

- **The pages: yes, in principle.** A reader could fetch just the page objects and skip
  the audio entirely. The viewer does not do this today (above), and even if it did,
  it only works well on a _linearised_ file, where page 1's objects come first (defined
  below, in "What linearisation is"). Without
  linearisation the reader has to fetch the xref at the end of the file first, then jump
  to each object it needs — more round trips before anything renders. The 28 MB fixture
  is not linearised, and stamping removes linearisation from any file that has it
  (§13).
- **The audio as a whole: yes.** It is one stream at one known offset, so it can be
  fetched on its own, all of it, without the pages.
- **Part of the audio: no.** Not playing from the middle, not seeking, not starting
  before the end has arrived — because the stream is compressed.
- **This is a limit of audio _inside a PDF_, not of range requests.** The same MP3 served
  at its own URL streams and seeks by range with no code at all (§13).

### Why a PDF is read from the end, and what linearisation changes

**Think of a PDF as a book whose table of contents is on the last page.** Every PDF
reader starts at the end: the last few bytes say where the index (the _xref_) is, and
the index says where every object is. Pages, fonts, images and attachments are all
objects. Only then can the reader jump to page 1.

```text
An ordinary PDF — the index is at the back

  [ header ][ page 3 ][ audio 28 MB ][ page 1 ][ font ][ page 2 ] … [ index ][ "index is here" ]
                                                                        ▲              ▲
                                                           2. read the index   1. start here
```

Objects can be stored in any order, because the index says where each one is. Page 1 can
sit anywhere, even behind 28 MB of audio.

**Whether starting from the end costs anything depends on whether the bytes are already
there.**

- **Already in memory: free.** `@libpdf/core` works this way. `PDF.load(bytes)` only
  accepts the complete file, so going to the end and jumping around is just looking up
  positions in an array it already holds. It is like flipping to the back of a book in
  your hand.
- **Still on the server: one round trip per jump.** A reader that downloads by range has
  to ask for the end, wait, read the index, ask for page 1, wait, then ask for the font
  page 1 uses, and wait again. It is like getting a book one photocopied page at a time,
  starting with the last one. Each request is a full wait on the network.

**Reading and downloading are separate things.** Reading means parsing bytes you already
have, in any order you like. Downloading means getting them from the server, and the
order there depends on the request:

- **A normal download goes front to back.** A plain `GET /case.pdf` returns the whole
  file from its first byte to its last. The end arrives last, and there is no skipping
  ahead.
- **A range request can ask for any part, including the end.** The client names the
  bytes it wants in a header, and the server replies `206 Partial Content` with just
  those. The server has to support it, which it signals with `Accept-Ranges: bytes`;
  most static hosts do.

  ```text
  Range: bytes=0-1023          the first 1 KB
  Range: bytes=5000-9999       a slice from the middle
  Range: bytes=-1024           the LAST 1 KB, without knowing the file size
  ```

So a reader that downloads by range can start from the end, but every jump is another
round trip:

```text
1. Range: bytes=-1024       → the end: "the index is at byte 29,760,000"
2. Range: bytes=29760000-   → the index: "page 1 is at byte 1,200, its font at 4,800"
3. Range: bytes=1200-4799   → page 1
4. Range: bytes=4800-…      → the font
```

That is four waits before page 1 can be drawn, which is the cost of an ordinary PDF. (The
byte positions are illustrative.)

#### What linearisation is

**Linearisation is a way of laying out a PDF so that page 1 can be shown before the rest
of the file has downloaded.** It is optional, defined in the PDF specification (ISO
32000, Annex F), and often labelled "Fast Web View" in Acrobat. It changes where things
sit in the file, not what the document contains.

A linearised file does two things:

1. **Its first object is a small dictionary** that announces "this file is linearised"
   and says where page 1's data ends.
2. **Everything page 1 needs comes straight after it**: the page, its fonts, its images
   and an index for just those objects. The rest of the document follows.

```text
A linearised PDF — everything page 1 needs comes first

  [ header ][ "linearised, page 1 ends at byte E" ][ page 1 ][ its font ][ index for page 1 ] … the rest …
     └──────────────────── the first request gets all of this ────────────────────┘
```

One request from the start of the file (`Range: bytes=0-65535`, say) is enough to
render page 1, and the rest can arrive afterwards. In the book analogy, a table of
contents for chapter one has been moved to the front, along with chapter one itself.

**A real example.** `case-embedded-audio-media.pdf` opens like this:

```text
%PDF-1.7
16 0 obj <</Linearized 1 /L 8342103 /O 18 /E 48012 /N 1 /T 8341789 /H [480 198]>>
```

| Key | Value | Meaning |
|---|---|---|
| `/Linearized` | `1` | This file is linearised |
| `/L` | `8342103` | The file's length in bytes when it was linearised |
| `/O` | `18` | Page 1 is object 18 |
| `/E` | `48012` | Page 1's data ends at byte 48,012 |
| `/N` | `1` | The document has 1 page |
| `/T` | `8341789` | Where the full index for everything else starts |
| `/H` | `[480 198]` | A 198-byte "hint table" at byte 480, which helps a reader find later pages |

So the first 48 KB of an 8.3 MB file (0.6%) are enough to draw page 1. The 8.2 MB MP3
sits after that, and a reader would never have to wait for it.

**A linearised file only stays linearised if nothing is appended to it.** A reader
checks `/L` against the real file length and ignores the linearisation if they differ.
pdf.js does exactly this (`class Linearization` in its worker): on a mismatch it logs
`The "L" parameter … does not equal the stream length` and treats the file as ordinary.

That is what happened to this fixture. It was linearised, then two revisions were
appended to it, which is why it has 3 `%%EOF` markers:

```text
/L says     8,342,103 bytes
file is     8,346,945 bytes   → pdf.js treats it as not linearised
```

So this fixture still illustrates the layout, but a reader will not treat it as
linearised.

**A valid one: `case-linearized.pdf`.** It is `case-multi-audio.pdf` with one more
attachment added, `court-recording-excerpt.mp3` (the first 1 MB of the recording in
`case-audio-attachment-large`), then written out linearised by qpdf through pikepdf.
qpdf's own validator passes it:

```text
<< /Linearized 1 /L 1020403 /H [ 980 120 ] /O 14 /E 2928 /N 1 /T 1020064 >>
                    ▲                                ▲
     matches the file: 1,020,403 bytes     page 1 is done by byte 2,928
```

Page 1 is complete in the first 2.9 KB of a 1 MB file (0.3%). The four audio
attachments come after it.

**Why 1 MB.** pdf.js only uses range requests on a file larger than twice its 64 KB
chunk size, so anything up to 128 KB is fetched in a single request whatever its
layout (`validateRangeRequestCapabilities` in pdf.js). A first version of this fixture
was 46.8 KB and was downloaded with one `200`, which showed nothing. At 1 MB the file is
about 16 chunks, and page 1 fits inside the first.

**Neither of our servers lets pdf.js use ranges today, for opposite reasons.** pdf.js
decides from the headers of its first, ordinary request. It needs `Accept-Ranges: bytes`
and no `Content-Encoding`:

| Server | `Accept-Ranges` | `Content-Encoding` | Serves a `Range` request? | pdf.js uses ranges? |
|---|---|---|---|---|
| Vite dev server | **missing** (now added, see below) | none | Yes, `206` | No (now yes) |
| Netlify | `bytes` | **`br`** (Brotli) | Yes, `206`, uncompressed | No |

- **Vite** honours a range request when asked, but never advertises that it can, so
  pdf.js never asks.
- **Netlify** advertises ranges, but compresses the full response whenever the browser
  accepts compression, and browsers always do. pdf.js refuses ranges on a compressed
  response.

Measured with `curl` against `vite` and against the `libpdf-attachments` branch deploy.
So a single `200` in DevTools is expected on both, even for this 1 MB file. It tells us
about the servers, not about Kendo.

**The dev server now allows ranges.** `advertisePdfRanges` in `vite.config.ts` adds
`Accept-Ranges: bytes` to PDF responses, so the Vite dev and preview servers meet every
pdf.js condition. Netlify is unchanged: stopping it from compressing PDFs has not been
looked into.

Confirmed in Chrome with "Test: Linearised PDF", stamp off and no throttling. The
Network tab showed three `200`s and three `206`s, the page rendered, and all 4
attachments were listed. Headless Chrome (Playwright) saw the same thing with one more
`200`.

**A first try looked broken, but throttling was the likely cause.** In that window
loading never seemed to finish and the attachments never appeared, so the plugin was
reverted and later restored. DevTools was set to Slow 4G at the time, and under
throttling the attachments only appear once the whole file has arrived, because the
listing reads it through `getData()`. The Adobe Acrobat extension was also throwing
errors in that window.

#### Does Kendo gain anything from ranges? No

Measured in headless Chrome (Playwright), "Test: Linearised PDF", stamp off, throttled
to roughly Slow 4G (200 KB/s, 150 ms latency). Two dev servers ran the same code, one
with the range plugin and one without, and each was checked with `curl` on the exact
address the browser used. The initiator of every request was read from Chrome's async
call stacks, to separate Kendo's requests from the thumbnail sidebar's. Two runs each,
with identical results:

| | Kendo draws page 1 | Thumbnail shown | Attachments listed |
|---|---|---|---|
| Ranges off | 5.8 s | 5.8 s | 5.8 s |
| Ranges on | 5.8 s | 5.8 s | 5.8 s |

The request log with ranges on shows why:

```text
who         status  range                  start   end     over the network
?           200     full                   0.5 s   5.8 s   1021 KB
thumbnails  200     full                   0.5 s   5.8 s      0 KB
kendo       200     full                   0.5 s   5.8 s      0 KB
kendo       200     full                   0.5 s   5.8 s      0 KB
thumbnails  206     bytes=0-65535          0.8 s   5.8 s      0 KB
kendo       206     bytes=0-65535          0.9 s   5.9 s      0 KB   ← page 1's chunk
thumbnails  206     bytes=983040-1020402   1.0 s   6.1 s      0 KB
kendo       206     bytes=983040-1020402   1.0 s   6.2 s      0 KB   ← the xref at the end
kendo       206     bytes=0-65535          1.1 s   6.4 s      0 KB
kendo       206     bytes=983040-1020402   1.1 s   6.5 s      0 KB
```

- **Kendo does make range requests.** Its pdf.js asked for the first 64 KB, which holds
  all of page 1, at 0.9 s.
- **That request did not finish until 5.9 s**, just after the full download, and
  transferred nothing itself. It was answered from Chrome's cache once the full
  download had landed. Every range request behaves the same way.
- **So the ranges bring nothing.** pdf.js starts a full download before it knows ranges
  are possible, and Kendo gives no way to stop it (`disableStream`, `disableAutoFetch`).
  Chrome appears to hold range requests for a file until that in-flight download has
  written it to the cache. That is inferred from the timings, not confirmed in Chrome's
  source.

**Kendo does not block range requests, but it cannot benefit from them.** Page 1 shows
when the whole file has arrived, with or without ranges. A viewer that could show it
early would need pdf.js configured directly with streaming or auto-fetch off, and a
server that allows ranges without compressing: a backend concern, as §13 argues.

#### Kendo waits for every page before drawing any

Separately from ranges, Kendo would not show page 1 early even if the bytes arrived
early. Its load function (`loadPDF` in `@progress/kendo-pdfviewer-common` 1.0.2,
`dist/es/utils.js`) works like this:

```js
getDocument(params).promise.then((pdfDoc) => {
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) pages.push(pdfDoc.getPage(i));  // ask for every page
  ...
  Promise.all(pages)                                   // wait for ALL of them
    .then((all) => all.map((page, i) => {
      appendPage(dom, createEmptyPage(page, ...), i);  // only now does page 1 go on screen
      if (options.loadOnDemand) { if (i < loadOnDemandPageSize) renderPage(...) }
      else renderPage(...);                            // and every page is drawn
    }))
```

In plain terms:

1. **It asks pdf.js for every page at once.** On a 100-page document that is 100 page
   lookups. Their data is spread through the whole file, so when loading by range,
   each can need its own fetch.
2. **Nothing appears until all of them have answered.** `Promise.all` waits for the
   slowest page, so page 1 waits for page 100.
3. **Then every page is drawn.** The shared code has a `loadOnDemand` option that would
   draw only the first two, but the React viewer never passes it. `PDFViewer.mjs` in
   `@progress/kendo-react-pdf-viewer` 16.1.0 calls `loadPDF` with only `url`, `data`,
   `arrayBuffer`, `dom`, `zoom`, `done` and `error`.

This was checked against Kendo's published API too:

- **The React viewer has no option for any of it.** Its [API reference][kendo-react-api]
  lists 22 props: the file source, zoom, toolbar, events and rendering callbacks.
  None controls on-demand loading or passes options to pdf.js (`disableRange`,
  `disableStream`, `disableAutoFetch`).
- **The Angular viewer does have one.** Kendo documents a [`loadOnDemand`
  option][kendo-angular-lod] for Kendo UI for Angular, where "one page is loaded
  initially, and the following pages are requested as the user scrolls". It is not
  exposed in React. In the shared code installed here, it limits which pages are
  _drawn_, but the `Promise.all` over every page still runs first. Whether Angular
  uses different code was not checked.

**Newer versions do not change this** (checked 2026-09-23). 16.1.0 and 1.0.2 are the
latest stable releases on npm. The development builds `16.2.0-develop.11` and
`1.0.3-develop.3` were downloaded and diffed against them:

- The React viewer's props are identical, and it still never passes `loadOnDemand`.
- `loadPDF` still asks for every page, waits on `Promise.all`, then draws every page.
- The only change to the pdf.js call is WebAssembly decoding support (`wasmUrl`,
  `useWasm`), not loading options. Still no `disableRange`, `disableStream` or
  `disableAutoFetch`.

**So page count makes this worse, not better.** A 1-page test file hides it. On a long
document, page 1 waits for every other page's data, and for every page to be drawn. A
viewer that shows page 1 first would have to call pdf.js directly and ask for page 1
alone. This is reasoned from the code, not measured on a long document.

[kendo-react-api]: https://www.telerik.com/kendo-react-ui/components/pdfviewer/api/pdfviewerprops
[kendo-angular-lod]: https://www.telerik.com/kendo-angular-ui/components/pdfviewer/load-on-demand

#### Four full requests: shared on a small file, four real downloads on a large one

Every case switch makes four full requests for the PDF. Their initiators, from Chrome's
async call stacks:

| Requested by | Why |
|---|---|
| `KendoPdfViewer.tsx` | The viewer |
| `KendoPdfViewer.tsx` again | React Strict Mode (`main.tsx`) mounts twice in development. Dev only. |
| `usePdfThumbnails.ts` | The thumbnail sidebar opens the file with its own pdf.js call |
| `useAttachments.ts`, `loadDocument` | **The fallback `fetch`**, see below |

How much actually crossed the network (Chrome's `encodedDataLength`, cache on, cold
profile, no throttling):

| File | Request 1 | 2 | 3 | 4 | Total |
|---|---|---|---|---|---|
| Linearised PDF (1 MB) | 1021 KB | 0 | 0 | 0 | **1 MB**, shared |
| Large Audio Attachment (28 MB) | 29.8 MB | 29.8 MB | 29.8 MB | 29.8 MB | **~119 MB**, four downloads |

On the small file, Chrome let one request download and served the other three from its
cache. On the large file it did not: all four downloaded in full, at the same moment.
Why size changes this was not investigated. DevTools shows the same thing in a normal
Chrome window: with **Disable cache** off, the viewer and the thumbnails each show
29.7 MB for the large file.

An earlier version of this section said the file is always downloaded once. That was
measured on the 1 MB file only, and is wrong for large ones. With **Disable cache** on,
every request downloads in full, whatever the size.

**The `useAttachments` request contradicts its own documentation.** `loadDocument`
reads the viewer's bytes when it has them and otherwise falls back to `fetch`. Its
comment says the application never takes the fallback, but it does, on every case
switch. `source` (the viewer's pdf.js document) is `null` until Kendo has parsed the
file, and the hook's effect runs before that, so it downloads the whole file itself.
When the viewer's document then arrives, the effect runs again and reads it from
there. So commit `6628ea9` added the borrowing path, but the fallback still runs first.
Why §13 nonetheless measured an improvement on the deployed build was not
re-investigated. The likely fix is to wait for `source` rather than fetch. Not yet
changed.

In a production build, Strict Mode's double mount is gone, which leaves three
downloads of a large file. That matches §13's "three requests still appear", and this
is where they come from.

**So:**

| | Ordinary PDF | Linearised PDF |
|---|---|---|
| Bytes already in memory (`@libpdf/core`) | No difference | No difference |
| Downloaded by range (pdf.js) | End first, then a request per jump | Page 1 from the first request |

Linearisation only matters in the bottom row, and in this app nothing is in the bottom
row yet. Every path uses a plain full download, so the whole file arrives front to back,
and only then does reading start from the end, in memory:

- **The stamp** fetches the whole file itself, then gives the viewer a `blob:` URL that is
  already in memory (`usePdfStamp`).
- **Kendo doesn't let us configure pdf.js.** It calls pdf.js with only
  `{ url, verbosity, isEvalSupported }` (`kendo-pdfviewer-common/dist/es/utils.js`), so
  the range options (`disableRange`, `disableStream`, `disableAutoFetch`) cannot be set.
  With pdf.js's defaults, auto-fetch keeps downloading until it has the whole file. Kendo
  also requests every page up front, not just the visible ones.
- **Our own code needs the whole file.** The attachment listing reads it through
  `getData()`, which only resolves once every byte has arrived. The download button does
  the same.

Two test files carry a linearisation dictionary. `case-linearized` is valid, and
`case-embedded-audio-media`'s is stale, as shown above. Stamping removes it from both
(§13).

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

---

## 13. Where this should go next: split the file server-side

The measurement that makes the case, from the deployed build on a good connection:

```text
case-audio-attachment-large.pdf   29,771,173 bytes   4.49 s on a cold load
                                  29,728,354  = the embedded audio   (99.9%)
                                      42,819  = the page we render   (42 KB)
```

**700× more is downloaded than the page needs.** Nothing in the code is slow — the wait
is the transfer, and it finishes before `PDF.load` runs. The file is not linearised
either, so there is no partial-render path for a browser to take.

### What was already fixed in the browser, and what was not

The first measurement of this was worse, and for a different reason. Several things on
the page load the same PDF — the Kendo viewer, the thumbnail sidebar, and, until it was
changed, `useAttachments`. On a cold cache all of them downloaded in full.

```text
                      before          after
big file, cold load   3 × 200         1 × 200 + 2 × 304
                      ~89 MB          29.7 MB, 4.49 s
```

The fix was to stop being one of them: `useAttachments` now reads the bytes pdf.js
already downloaded, through `getData()`, instead of requesting the file again.

**Why removing one request fixed the others is not established.** The measurement is
repeatable, the mechanism is a guess. The likeliest explanation is timing — the hook's
fetch ran on mount, before the viewer and sidebar had initialised — but that was not
verified. An earlier theory, that Chromium refuses to cache entries past a size
threshold, was disproved by a later run in which the same file cached perfectly well.
Note also that three requests still appear afterwards, so one of the remaining consumers
issues two; which one has not been checked.

What is certain is that reading bytes somebody already has cannot cost a transfer,
whatever the cache happens to do. That is why the change is worth keeping independently
of the explanation.

Measured cold, after clearing the cache, with `Disable cache` off:

| File | Requests | Time |
| ------- | ----------------- | ------ |
| 29.7 MB | 1 × 200, 2 × 304 | 4.49 s |
| 8.2 MB  | 1 × 200, 2 × 304 | 2.43 s |

Note `Disable cache` makes this measurement meaningless — it forces every request to
bypass the cache, so three downloads are guaranteed by the setting rather than by any
behaviour worth fixing. An empty cache is the thing to test, not a disabled one.

**Sharing one parsed document between the viewer and the thumbnails was considered and
dropped.** The thumbnail request is now a 304, so it costs a round-trip rather than a
transfer, and reshaping `usePdfThumbnails` around Kendo's internal document is not worth
that. Nothing further is available browser-side.

What remains is the single transfer below, and only the backend can remove it.

### The shape of the fix

Have the backend parse the document once and serve two things instead of one:

```text
GET /case/123/view.pdf     42 KB   attachment stripped   → renders immediately
GET /case/123/audio.mp3    28 MB   served as its own URL → only if someone plays it
GET /case/123/attachments  ~200 B  JSON: name, size, type, page
```

### Why the audio URL is the important half

Today `read()` pulls the whole attachment into memory, wraps it in a Blob, and hands the
player a `blob:` URL. **Playback cannot start until the last byte has arrived**, because
a Blob has no concept of partial content.

A plain URL is a different thing entirely. `<audio src="/case/123/audio.mp3">` makes the
browser issue range requests on its own: it buffers a few hundred kilobytes, starts
playing, and fetches the rest while the audio runs. Seeking works the same way — dragging
to twenty minutes in fetches that byte range rather than everything before it.

This is also why the audio has to leave the PDF rather than be range-read inside it: the
embedded copies are Flate-compressed, so no range of them is playable on its own (§5).
Extracted and served decompressed, the MP3 is seekable by byte again.

So a 28 MB recording starts playing in about a second instead of after a full download,
and a listener who plays ten seconds and stops has transferred ten seconds of audio. The
only requirement is `Accept-Ranges: bytes`, which every static host and framework already
sends.

### The stamp belongs there too

Not obvious until measured. `usePdfStamp` re-saves the document to draw a header bar
across the top of every page (see `CASE-STAMP.md`), and that rewrite has three effects:

```text
attachments   survive      — part of the object graph, written back byte-identical
linearisation does not     — original /Linearized: true, stamped: false
signatures    do not       — revisions are flattened, so the signed byte range no longer matches
size          +1–3 KB      — per file, for the bar and its five fields
```

Attachments surviving is what makes the current design safe: with the stamp on, both
the viewer and the attachment listing read the stamped copy rather than the original.
That was checked across all 17 test files, reading every attachment back with
`readAttachment` and hashing it; `CASE-STAMP.md` has the per-file results.

Losing linearisation is the one that constrains the future. A linearised file can be
rendered from its opening bytes, which is the prerequisite for the progressive loading
in §13's alternative — and stamping silently removes it. Neither `@libpdf/core` nor
pdf-lib can write a linearised file to put it back; `qpdf --linearize` can. So **stamp
and progressive-load are in tension in the browser and not on a server**, where the
order is simply: stamp, strip the attachment, re-linearise, serve.

One correction to the measurement above: the fixture's linearisation was already dead
before stamping. Two revisions had been appended after it was linearised, so its `/L` no
longer matches the file length, and pdf.js ignores it (see "What linearisation is" in
§5). So that measurement proved less than it seemed.

It has since been confirmed on a valid one. `case-linearized.pdf` passes qpdf's
linearisation check. Stamped with the hook's drawing code, it fails:

```text
                     before                  after stamping
qpdf is_linearized   True                    False
Linearised           yes (/L = file length)  no dictionary at all
```

Everything else came through, including all four audio attachments, byte-identical. So
stamping in the browser does remove linearisation, and only a server-side step like
`qpdf --linearize` can put it back.

### What else it settles

- **No PDF parsing in the browser.** The listing arrives as JSON, so `@libpdf/core`
  leaves the bundle — 1 MB or more, and with it the pre-1.0 API risk in §10.
- **All six mechanisms become reachable.** §12's four gaps are a server-side library
  choice rather than a rewrite, and the server can use the mature ones — PDFBox, iText,
  PyMuPDF — instead of the two JavaScript libraries that expose an object graph.
- **Parse once per document, not once per viewer.** Results cache; today every viewer
  parses again.
- **Memory stops being the constraint.** §11's ceiling was the browser holding a decoded
  copy. Streaming never holds the whole file at all, which is what makes the mobile
  question go away rather than being managed.

### What it does not settle

A page-heavy document still transfers in full, because the viewer needs it to render.
Stripping attachments does nothing for a 200-page scan — that one needs linearisation and
range requests, or server-side rendering. The two problems are unrelated and this fixes
only the first.

It also adds a backend where there is currently none: a parsing service, storage for
extracted media, and cache invalidation when a document changes. That is the real cost,
and it is a product decision rather than a technical one.
