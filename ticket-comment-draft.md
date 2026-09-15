<!--
DRAFT — ticket comment for the audio attachment indicator spike.
Not part of the repo docs; left untracked. The long-form version lives in
ATTACHMENT-INDICATOR.md. Paste the body below into the ticket and replace the
[screenshot: ...] markers with the captures.
-->

## Spike outcome — audio attachment indicator

**Recommendation: bottom bar as primary, details panel as secondary. Drop the toolbar.**

Live demo (switch placements from the header dropdown):
https://kendo-react-all--pdf-viewer-compare.netlify.app
Test cases: CASE-TEST-AUDIO, CASE-TEST-AUDIO-MP3, CASE-TEST-AUDIO-MULTI

---

### Technical finding: how audio playback was achieved

KendoReact's PDF Viewer has **no attachment support of any kind** — not just no audio.
There is no attachments panel, tool or API; its toolbar is a closed set of nine tools
(pager, spacer, zoomInOut, zoom, selection, search, open, download, print).

This is expected rather than a gap in Kendo: PDF attachments are not page content, so
no PDF renderer draws them. They live in the document's embedded-file catalogue.

**Method used.** Kendo exposes the pdf.js document it has already parsed via its ref.
We read the attachments straight off that object:

1. On Kendo's `onLoad`, take `viewerRef.current.document` (a pdf.js PDFDocumentProxy).
2. Call pdf.js's `getAttachments()` → raw bytes + filename per embedded file.
3. Guess a MIME type from the file extension (pdf.js supplies none).
4. Wrap the bytes in a Blob, create an object URL per file.
5. Audio MIME → render an `<audio controls>`; anything else → a download link.

Key point: this reads from the document **already in memory**, so the PDF is not
fetched or parsed a second time. No extra library, no server work.

Caveat worth recording: object URLs must be revoked when the document changes or the
view unmounts, or each case switch leaks an entire decoded file. This is invisible in
normal use — nothing errors, memory just grows.

---

### AC1 + AC2 — options identified, and where each appears

|       | Placement                                | Character           |
| ----- | ---------------------------------------- | ------------------- |
| **A** | Persistent bar pinned below the document | Part of the document |
| **B** | Icon + count inside the viewer toolbar   | Part of the tooling |
| **C** | Section in the Document Details panel    | File metadata       |

[screenshot: Option A — bottom bar]
[screenshot: Option B — toolbar + popover]
[screenshot: Option C — details panel]

---

### AC3 — expected interaction per option

**A. Bottom bar**
Visible whenever the document has attachments. Tap/click the bar to expand the list in
place; tap again to collapse. Nothing to dismiss — the bar itself never leaves.
Mobile: accent-tinted, 44px tap target, paperclip leading, caret trailing.

**B. Toolbar**
Click the icon to open a popover anchored beneath it. Dismiss via Esc, click-outside,
or clicking the icon again. Mobile: label visually hidden, count becomes a corner badge.

**C. Details panel**
Always expanded — no toggle. The panel is a destination you open deliberately, so a
second disclosure inside it is a second lock on the same door.
Mobile: behind the panel toggle (two taps + scroll).

All three: audio files get an inline player, non-audio files get a download link.

---

### AC4 — recommendation

| Dimension                         | A. Bottom bar      | B. Toolbar | C. Details        |
| --------------------------------- | ------------------ | ---------- | ----------------- |
| Discoverability (first-time user) | **High**           | Low        | Lowest            |
| Taps to reach (mobile)            | **1**              | 1          | 2 + scroll        |
| Layout cost                       | A permanent strip  | **None**   | **None** in viewer |
| Visible before case selected      | **Yes**            | **Yes**    | No                |
| Implementation risk               | Low                | **High**   | **Lowest**        |

**Ship A as primary, populate C as secondary. Drop B.**

These are not mutually exclusive, and treating the ticket as one choice is the wrong
frame — they serve two different users. Someone who does not know a document contains
audio will never go looking for it, so only an always-present indicator reaches them
(A). Someone who has already gone to check what is in the file is served by C, which
costs nothing extra to populate.

B is the one to drop, on an unusual combination: it is both the quietest of the three
**and** the most fragile. A compact option normally earns its place by being cheap;
this one is neither loud enough to do the job nor cheap enough to keep for free.

Specifically, B required working around two separate pieces of Kendo's own CSS that we
do not control:

- `.k-toolbar { overflow: hidden }` clipped the popover out of existence.
- `.k-toolbar` is also `position: relative; z-index: 1`, making it a stacking context —
  so the popover painted _behind_ the document, and no z-index value could fix it.

Both are worked around (fixed positioning + a React portal), but a Kendo upgrade can
move either.

---

### Verification

- **32 automated tests** cover the attachments work (12 on the data/blob-URL layer,
  16 on the three placements, 4 on the bottom bar). Full suite: 168 passing.
- A shared contract runs against all three placements, so the comparison is executable
  rather than asserted.
- **Manual device testing was essential and found four bugs a green suite missed** —
  clipping, z-index stacking, a clipped count badge, and a collapsed audio scrubber.
  None were visible to jsdom, which has no layout engine, no paint step and no media.
  Recommend real-device checks for any UI of this kind.

---

### Open questions

- Auto-expand when there is exactly one attachment?
- Should the count break down by type ("2 audio, 1 document") or stay a total?
- Do non-audio attachments warrant the same indicator, or is this audio-specific?
- Details-panel gating: should attachments show before a case is selected?
- Behaviour at 10+ attachments — current fixtures top out at three.
