# Attachment indicator — where it should live

Research ticket. Three placements for the PDF audio-attachment indicator were built and
put behind a live switcher (header dropdown) so they could be compared against real
documents rather than mockups. Test fixtures: `CASE-TEST-AUDIO`, `CASE-TEST-AUDIO-MP3`,
`CASE-TEST-AUDIO-MULTI`.

**Recommendation: bottom bar as primary, details panel as secondary. Drop the toolbar.**

| Dimension | Bottom bar | Toolbar | Details panel |
|---|---|---|---|
| Discoverability (first-time user) | **High** — unavoidable | Low — must scan the bar | Lowest — nothing points to it |
| Taps to reach (mobile) | **1** | 1 | 2 + scroll |
| Layout cost | A permanent strip | **None** | **None** in the viewer |
| Mental model | Part of the document | Part of the tooling | File metadata |
| Dismissal | Collapse; bar stays | `Esc`, click away, re-click | None — always open |
| Visible before a case is selected | **Yes** | **Yes** | No |
| Implementation risk | Low — our own CSS | **High** — two Kendo workarounds | **Lowest** — reuses panel conventions |
| Room for many attachments | Good — scrolls at 50dvh | Fair — popover scrolls | Good — panel already scrolls |

---

## The three placements

These are not one component in three positions. Each takes a different view of what an
attachment *is*, and the interaction follows from that view.

### Bottom bar — "the document has something else in it"

`src/components/PdfAttachments/BottomBarAttachments.tsx`

Pinned below the document, full width, present whenever the file has attachments. Click
or tap the bar to expand the list in place; again to collapse. Nothing to dismiss — the
bar itself never goes away. On mobile it is tinted with the accent, given a 44 px tap
target, and led with a paperclip, with the caret moved to the trailing edge.

- **+** Cannot be missed. The only option that reaches a user who does not already know
  attachments exist.
- **+** Reads as part of the document, which is what an embedded file actually is.
- **−** Costs a strip of vertical space permanently, on the screen that has least of it.
- **−** Needed three rounds of work before it was genuinely discoverable on a phone.

### Toolbar — "one more thing the viewer can do"

`src/components/PdfAttachments/ToolbarAttachments.tsx`

An icon and count among the viewer tools, beside zoom, download and print, injected via
Kendo's `onRenderToolbar`. Click opens a popover anchored under the button; dismissed by
`Esc`, by clicking away, or by clicking the button again. On mobile the label is visually
hidden and the count rides the icon as a corner badge.

- **+** Costs no layout space at all — the bar already exists.
- **−** Quiet. A badge among icons is invisible to anyone not already scanning the toolbar.
- **−** Frames attachments as tooling, not as content belonging to the file.
- **−** Structurally coupled to Kendo's CSS. Two separate fights, both won with
  workarounds a Kendo upgrade could undo. See finding 2.

### Details panel — "a property of the file, like its size"

`src/components/PdfAttachments/DetailsAttachments.tsx`

A section inside Document Details, beside File Info and Tags. Always expanded, with no
toggle — the panel is somewhere you go on purpose, so a second thing to open is a second
lock on the same door. On mobile it sits behind the panel toggle.

- **+** Conceptually the tidiest. An embedded file genuinely is metadata about the document.
- **+** Zero layout cost in the viewer, and no third-party CSS to fight.
- **−** Steepest to discover, and nothing elsewhere hints the trip is worth making.
- **−** Inherits the panel's gating — see finding 3.

---

## What building them proved

The useful part of prototyping all three was not the screenshots. It was finding out
which arguments survive contact with a real viewer on a real phone.

### 1. Discoverability is a layout property, not a styling one

The bottom bar was invisible on mobile, and the first fix — tint it, enlarge the tap
target, add an icon — changed nothing. The real cause was that the app sized itself
`100vh`, which on a phone is the viewport height with the browser chrome *retracted*. The
last element in that column sat behind the URL bar.

```css
/* Layout.css */
height: 100vh;   /* fallback */
height: 100dvh;  /* tracks the chrome as it shows and hides */
```

No amount of loudness helps something that is not on screen. Worth remembering before any
future "make it more prominent" ticket.

### 2. The toolbar placement is structurally coupled to Kendo

It failed twice, in two ways that looked unrelated from the outside.

First the popover never appeared — `.k-toolbar` is `overflow: hidden`, so it was clipped
away the instant it extended past the bar. The button's pressed state still worked, which
made it read as a styling quirk rather than a missing panel.

Then, once fixed positioning freed it from the clip, it rendered *behind the document*.
The toolbar is also a stacking context, and z-index cannot climb out of one:

```css
/* kendo-theme-default — neither of these is ours */
.k-toolbar                   { overflow: hidden; position: relative; z-index: 1 }
.k-pdf-viewer-pages .k-page  { position: relative; z-index: 1 }  /* later in DOM → wins */
```

No z-index value could have fixed the second one, however large. Both are now worked
around — fixed positioning for the clip, a portal to `document.body` for the stacking
context — but both workarounds exist to route around third-party CSS we do not control,
and a Kendo upgrade can move either. That is a real maintenance cost the other two
placements do not carry.

Note also that neither bug was visible to the test suite: jsdom does no layout and no
painting. The tests pin the *mechanism* (not a descendant of the toolbar; coordinates
applied) because the visual result is not checkable without a browser.

### 3. Filing attachments as metadata inherits the metadata panel's constraints

The details placement is the cleanest to build and the easiest to argue for on paper. In
practice it is invisible until a case is selected, because the whole panel is — even
though the viewer is showing a document, with audio in it, the entire time.

That is not a bug introduced by the placement; it is the placement adopting a constraint
that already existed. Which is exactly the kind of thing that only shows up once the
thing is running.

---

## Recommendation

**Bottom bar as primary, details panel as secondary. Drop the toolbar.**

The placements are not mutually exclusive, and treating this as a single choice is the
wrong frame. They serve two different users.

Someone who does not know a document contains audio will never go looking for it, so the
only placement that reaches them is the one that is always there. That is the bottom bar,
and it is worth the strip of space precisely because attachments are easy to not know
about.

The details panel costs nothing extra to populate and serves the opposite user — the one
who has already gone to check what is in this file. It belongs there on the merits, as
long as it is not the only place.

The toolbar is the one to drop. It is the quietest of the three *and* the most fragile,
which is an unusual combination: normally a compact option earns its keep by being cheap.
This one is neither loud enough to do the job nor cheap enough to keep around for free.

---

## Still open

- Should the bar auto-expand when there is exactly one attachment? One row costs little
  and removes a tap.
- Should the count distinguish types — "2 audio, 1 document" — or is a total enough?
- Do non-audio attachments deserve the same indicator at all, or is this specifically an
  audio affordance?
- Does the details-panel gating need fixing independently, so attachments show before a
  case is chosen?
- What happens with ten or more attachments? The fixtures top out at three.

---

## Removing the scaffolding

`PlacementSwitcher` and the `placement` prop exist only for this comparison. Once the
ticket is settled, delete `PlacementSwitcher.tsx`/`.css` and `placement.ts`, drop the
`placement` prop from `KendoPdfViewer` and `PdfDetails`, and delete the two rejected
placement components. The data layer stays — `useAttachments`, `attachmentStreams.ts`,
`attachments.ts`, `useAttachmentUrl` and `AttachmentControl` are shared by all three.

Note that `useAttachments` must still be called exactly once, from `PdfViewerPage`, though
the reason has changed: it parses the document to build the list, so calling it per
placement would parse once per placement. It no longer creates blob URLs — that moved to
`useAttachmentUrl`, one instance per attachment, created only when someone presses a
control. See `ATTACHMENT-EXTRACTION.md`.
