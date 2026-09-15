<!--
DRAFT — short ticket comment, plain language, for posting as-is.
Replace the [screenshot: ...] markers before posting.
ticket-comment-draft.md holds the long technical version if engineers need it.
-->

## Spike outcome — audio attachment indicator

**The limitation.** We use the KendoReact PDF Viewer, and it cannot display audio
attachments — it has no attachment support at all. This is not a fault in Kendo:
attachments are not part of the printed page, so no PDF viewer shows them. They are more
like a file stapled to the back of a document.

**How we handled it.** We built the attachment player as a **separate component, not part
of the PDF viewer**. It reads the attached files out of the document the viewer has
already opened and gives each recording its own audio player. Nothing extra is
downloaded, and because it sits outside the viewer it is not tied to Kendo — it would
still work if we switched to a different PDF viewer later.

So *where* the indicator goes is a design decision, not a technical constraint. All three
options below work.

---

### The three options

**A. Bottom bar** — an always-visible strip under the document.

[screenshot: Option A — bottom bar]

**B. Toolbar button** — a paperclip and count beside zoom / download / print.

[screenshot: Option B — toolbar button]

**C. Details panel** — listed with the file's other information.

[screenshot: Option C — details panel]

Try them live (switch with the dropdown in the top bar):
https://kendo-react-all--pdf-viewer-compare.netlify.app — use CASE-TEST-AUDIO-MULTI

---

### Comparison

- **A. Bottom bar** — impossible to miss, costs a permanent strip of screen space.
- **B. Toolbar button** — costs nothing, but too quiet to be noticed and the most fragile
  to maintain: it is the only option that required working around the vendor's own
  toolbar, and it broke twice during development.
- **C. Details panel** — fits naturally with the file's other information, but almost
  nobody will find it on their own.

In short: **A is the one people will notice, C is the one that belongs, and B is neither
noticeable enough nor simple enough to earn its place.**

---

### Recommendation

**Use A as the main indicator, and also list attachments in C. Drop B.**

A and C are not competing — they suit two different people, and we can have both.
A is the only option that reaches someone who does not know a recording exists, which is
worth the strip of screen space. C costs nothing extra and serves someone already looking
at the file's details.

B is the one to drop: it is both the least noticeable *and* the most fragile. It sits
inside the vendor's toolbar rather than our own UI, and broke twice during development
for two different reasons. A future version of that component could break it again.

---

### Decisions still needed

1. If there is only one recording, should the list open automatically?
2. Should the details panel show attachments before a case is selected? It shows nothing
   today, even though a document is already on screen.
