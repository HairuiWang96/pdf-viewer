# Testing — what we test, and how we decide

A working guide to this repo's test suite. Less about the API of any one tool, more about
the judgement calls: what is worth a test, what is not, and where the tests genuinely
cannot help.

```bash
npm test            # vitest run — the whole suite once
npm run test:watch  # vitest — re-runs on change
npm run test:coverage
```

168 tests across 14 files, at time of writing.

---

## The stack

### Why there are five tools

Running a single test needs five separate things, and each package does exactly one of
them. They are separate so they stay swappable — you could replace jsdom with a real
browser and keep the other four unchanged.

| #   | The need                                      | Tool                                                                                                                                      |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Something to _run_ tests and report pass/fail | **Vitest** — Vite-native, so the same transform pipeline as the build. Also supplies the `vi.*` fake toolkit, watch mode and v8 coverage. |
| 2   | A `document` to render into — Node has none   | **jsdom**                                                                                                                                 |
| 3   | Render a React component and reach the result | **@testing-library/react** — `render`, `renderHook`, `screen`                                                                             |
| 4   | Simulate a user interacting                   | **@testing-library/user-event**                                                                                                           |
| 5   | Readable assertions about DOM state           | **@testing-library/jest-dom**                                                                                                             |

### You only import three of them

A test file imports three:

```tsx
import { describe, it, expect } from 'vitest'; // 1
import { render, screen } from '@testing-library/react'; // 3
import userEvent from '@testing-library/user-event'; // 4
```

The other two are wired up globally, which is why they never appear:

- **jsdom** is `environment: 'jsdom'` in `vite.config.ts`. It is the _world_ the test runs
  in, not something you call.
- **jest-dom** is `import '@testing-library/jest-dom/vitest'` in `src/test/setup.ts`. It
  _adds methods to `expect`_, so it changes what `expect` can do without being named in
  your file.

That is why `toBeInTheDocument()` works with no import. It is not part of Vitest.

### One test, annotated

```tsx
it('reveals the attachments when the row is clicked', async () => {
  const user = userEvent.setup();                    // ← 4  user-event
  render(<BottomBarAttachments … />);                // ← 3  RTL, into jsdom's document (2)
  const toggle = screen.getByRole('button', {        // ← 3  RTL query
    name: /attachments/i });
  await user.click(toggle);                          // ← 4  full event sequence
  expect(toggle).toHaveAttribute('aria-expanded',    // ← 1 expect, 5 the matcher
    'true');
});
```

`it` and `expect` come from Vitest; `toHaveAttribute` is jest-dom bolted onto Vitest's
`expect`.

### What "a fake DOM" actually means

This is the load-bearing detail behind everything else in this document. jsdom **parses**
HTML and CSS and builds a tree. It never **renders** anything — there are no pixels and no
layout engine. Probed directly:

```js
el.style.width = '300px';

el.getBoundingClientRect(); // → { width: 0, height: 0, top: 0 }   no measurement
el.offsetWidth; // → 0                                 no measurement
getComputedStyle(el).width; // → "300px"        just echoing the string you assigned
window.innerWidth; // → 1024           a fixed, fake viewport
```

`getComputedStyle` answers because jsdom is reading back what you wrote.
`getBoundingClientRect` cannot, because that would mean working out where the element
actually lands — and nothing in jsdom does that.

Which is exactly why each of the four device bugs was invisible to a green suite:

| Bug                                    | The missing capability                                   |
| -------------------------------------- | -------------------------------------------------------- |
| `overflow: hidden` clipped the popover | Clipping needs layout. No layout, nothing clips.         |
| z-index put the popover behind the PDF | Stacking is a _paint_ concern. Nothing paints.           |
| `clip-path` hid the count badge        | Also paint.                                              |
| The audio scrubber collapsed           | Needs a real width _and_ a media engine. Neither exists. |

It also explains a quirk in our own code: `ToolbarAttachments`' `position()` calls
`getBoundingClientRect()` and gets zeros under test, while `window.innerWidth` is a
hardcoded 1024 — so the width resolves to `min(360, 1008) = 360`. The test proves a width
is **applied**. It can never prove the width is _right_ on a phone.

### Why user-event rather than `element.click()`

A real click is not one event. `user-event` fires the whole sequence —
`pointerdown → mousedown → focus → pointerup → mouseup → click`.

That is load-bearing here: the toolbar popover's dismiss handler listens for
**`mousedown`**, not `click`. A bare `element.click()` would never trigger it, and the
dismiss tests would pass while dismissal was broken in the browser.

### The picture

```text
┌─ Vitest ─────────────────────────────────────────┐   runs files, collects results
│  ┌─ jsdom environment ────────────────────────┐  │   provides document / window
│  │                                            │  │
│  │   React renders here  ← @testing-library   │  │   render() / screen queries
│  │                       ← user-event         │  │   realistic interaction
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│   expect(…) + jest-dom matchers                  │
└──────────────────────────────────────────────────┘
        ↑ everything above is text in Node
        ↓ nothing below the line exists
   layout · paint · stacking · audio  →  needs a real browser
```

That bottom line is why the QA section below exists.

Config lives in `vite.config.ts` under `test:`; shared setup in `src/test/setup.ts`.

---

## How to decide what to test

The useful question is **not** "what does this code do?" — that produces tests that
restate the implementation and catch nothing. Ask:

> **What could break here without anyone noticing?**

A bug that throws, blanks the page, or fails the build does not need a test; you will find
it in seconds. Tests earn their keep on failures that _look fine_.

Four places cases come from:

### 1. The contract

What a caller is promised. `BottomBarAttachments` promises: given attachments, show a
count; given none, render nothing; clicking expands the list.

### 2. Silent failures

Things that neither throw nor log. These are the highest-value tests in the repo, because
nothing else in the world will tell you:

- **Blob URL leaks.** Nothing breaks, nothing logs, the page looks perfect — memory just
  climbs for the life of the tab. `useAttachments.test.ts` and `usePdfStamp.test.ts` both
  have a `blob URL lifecycle` block for exactly this.
- **Accessible names.** If the paperclip in the bottom bar loses `aria-hidden`, the page
  looks _identical_ and screen readers begin announcing "paperclip Attachments 1".
- **Every player pointing at the first attachment.** Three players render, the UI looks
  right, and it is wrong only once someone presses play.

### 3. Bugs you actually hit

Every real bug becomes a permanent test. Not predicted — earned. The `usePdfStamp` leak,
the toolbar count nested inside its label, the popover with no width: all of those tests
exist because the bug happened.

### 4. Decisions someone could innocently undo

Collapsed-by-default is a _choice_. Someone could reasonably think "why not open it, it is
friendlier" without realising it was deliberate. The test is a note to that person.

---

## The check that makes a test real

After writing a test: **break the code and confirm the test fails.**

If it passes both with and without the fix, it is decoration. This is not a formality —
it caught several near-miss tests in this repo. Cheap way to do it:

```bash
git stash push src/hooks/usePdfStamp.ts   # revert just the fix
npx vitest run src/hooks/usePdfStamp.test.ts
git stash pop
```

Every bug-fix test in this repo was confirmed this way before being committed.

---

## Where the tests cannot help

`vite.config.ts` says it plainly:

> jsdom … is not a real browser — no layout engine, no PDF renderer, no audio decoding —
> so anything depending on actual rendering or playback belongs in manual/device testing,
> not here.

This is not a footnote. During the attachment-indicator work, **four separate bugs shipped
past a green suite**, every one found by looking at a real phone:

| Bug                                                  | Why jsdom could not see it |
| ---------------------------------------------------- | -------------------------- |
| Popover clipped by `.k-toolbar { overflow: hidden }` | No layout, so no clipping  |
| Popover painted behind the PDF (stacking context)    | No paint, so no z-order    |
| Count badge clipped away with its `clip-path` parent | No layout                  |
| Audio scrubber collapsed in a content-sized popover  | No layout, no media        |

The first two are the instructive ones. The tests asserted
`expect(screen.getByRole('dialog')).toBeInTheDocument()` and passed the **entire time** the
popover was invisible in a real browser.

> **A test that cannot fail for the reason you care about is worth nothing** — and worse
> than nothing, because it buys false confidence.

### What to do instead

When a device bug turns up, pin the **mechanism**, not the appearance. The mechanism is
checkable in jsdom; the appearance is not.‼️

| Instead of               | Assert                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| "the popover is visible" | it is **not a descendant** of the toolbar (escaped the stacking context) |
| "the scrubber shows"     | an explicit **width is applied**                                         |
| "the badge is on screen" | the count is **not inside** the visually-hidden label                    |

### A fifth thing jsdom cannot see: memory

The four above are all layout and paint. Attachment size is a different class, and it is
worth naming separately because a green suite says nothing at all about it.

An attachment can be hundreds of megabytes. Playing one costs roughly **4× its size** in
peak memory — the fetched PDF, the Blob copy, and the garbage in between. Measured in
Node, a 200 MB attachment peaks around 800 MB.

Node is not the constraint, though. A phone is:

| Environment | Expected ceiling | Confidence |
| ----------- | ---------------- | ---------- |
| Desktop Chrome / Edge | ~4 GB per tab; 200 MB comfortable | high |
| Desktop Firefox / Safari | similar order, untested | medium |
| **Mobile Safari** | **tabs killed in the low hundreds of MB** | high that a limit exists, low on where |
| Mobile Chrome (Android) | lower than desktop, device-dependent | low |

Only the first column is measured, and only in Node — the rest is expectation. That gap
is the point: **nothing in the suite, and nothing in Node, can tell you what a phone
does with a 200 MB attachment.**

The failure mode is also unlike the others. A layout bug looks wrong; this one takes the
tab away. `useAttachmentUrl` reports a read that threw, but it cannot report a process
the OS killed, so there is no error handling to write and no test to assert. The only
control is not shipping documents that large, and knowing where the line is.

What the suite _can_ hold, and does: that listing never reads a file (`useAttachments`
laziness tests), and that every Blob URL is revoked (`useAttachmentUrl` lifecycle tests).
Both are invisible to the eye and cheap in jsdom — the exact inverse of the layout bugs
above. The size ladder to run on real devices is in `ATTACHMENT-EXTRACTION.md` §11.

### The division of labour

- **Tests** own logic, structure, contracts, accessible names, lifecycle. They catch what
  eyes cannot: a leak is invisible, a stale closure looks fine.
- **A real device** owns layout, paint, stacking, media, and memory. Nothing in Node
  substitutes.

Neither is a failure of the other. Knowing which tool covers which is the whole skill.

---

## Working with QA

There is a testing team, so the question is not "how much testing do we do" but "which
failures are ours to catch". The attachment-indicator work answers it unusually clearly:

| Found by                 | Bugs                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The suite**            | A stamped PDF leaked on every case switch. Nothing broke, nothing logged, memory just climbed. **No amount of clicking would ever have found it.** |
| **A person, on a phone** | Popover clipped, popover behind the document, count badge gone, audio scrubber collapsed. **Four bugs past a green suite.**                        |

Neither side was slacking. They catch different classes of failure, and each is genuinely
bad at the other's.

### The split

**Developers answer: does the code do what I intended?**
Logic, contracts, lifecycle, silent failures. Fast, runs on every save, blocks the merge.
The unique advantage is catching what has _no visible symptom_ — leaks, stale closures, an
off-by-one in page indexing, a missing accessible name. Nobody clicks their way to a
memory leak.

**QA answers: does the product do what the user needs?**
Layout, paint, real devices, real documents, cross-browser, whole journeys, usability. The
unique advantage is being in a real browser with real eyes, which is precisely what jsdom
structurally cannot provide.

### Four rules for the developer side

1. **Test anything you would be embarrassed to receive as a ticket.** If QA files "the
   second player plays the first file", that should have been a unit test — it is
   mechanical, deterministic and cheap, and spending a person's afternoon on it is waste.

2. **Do not chase what QA is better placed to find.** Reaching for layout assertions in
   jsdom does not merely fail to help; it manufactures false confidence. See the popover
   tests above, which passed while the feature was invisible.

3. **Every QA bug that is mechanically checkable comes back as a test.** That is the
   ratchet. Pin the mechanism, not the visual symptom — the count-badge bug became "the
   count is not a descendant of the label", which is checkable and is what actually
   regressed.

4. **Tell QA what you could not cover.** The most commonly skipped step. A handoff note —
   "jsdom sees no layout, paint or media; the popover and the mobile bar need real-device
   eyes" — turns guesswork into targeted testing. It is a handoff, not a disclaimer.

### What developers owe QA beyond the code

- **Reproducible environments.** Every branch has its own Netlify deploy, so QA tests an
  exact commit rather than "works on my machine". Verify a push is actually live by
  comparing the deployed bundle hash against a local build — a green push is not proof.
- **Fixtures that exercise the edges.** The eleven `CASE-TEST-*` documents — multi-audio,
  redaction, legacy PDF 1.2, digital signature, scanned — are a dev-built QA asset. They
  are why someone can probe signature handling without going hunting for a sample file.
- **Affordances for testing.** The attachment placement switcher exists so all three
  options can be compared without a rebuild. Building that was dev work in service of
  testing.

### The gap worth naming

There is a missing middle rung: **no real-browser automation**. Playwright would have
caught all four of the bugs above. In a team with QA that layer is usually co-owned —
developers write it, QA defines which journeys matter. Right now the whole band is manual,
which is fine for a comparison prototype and would not be fine for a shipping product.
Worth raising as a shared roadmap item rather than deciding alone.

### The mindset to avoid

"QA will catch it." Some classes they never will — the stamp leak would have run in
production for months. And everything else costs more the later it is found: a failing
test is seconds, a QA ticket is a day of round-trip.

---

## Tools, by the problem they solve

| Problem                               | Tool                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| A dependency will not run in jsdom    | `vi.mock` — Kendo's `PDFViewer`, `pdf-lib`                              |
| A mock factory needs mutable state    | `vi.hoisted` — `vi.mock` hoists above imports, so shared state must too |
| jsdom lacks a browser API             | `vi.stubGlobal` — `URL.createObjectURL`, `fetch`                        |
| Watch a real function                 | `vi.spyOn` — `console.error` on failure paths                           |
| Record a callback                     | `vi.fn` — every `onPageChange`, `onSelectCase` prop                     |
| Testing a hook, not a component       | `renderHook`                                                            |
| Something resolves asynchronously     | `waitFor`                                                               |
| One contract, several implementations | `describe.each`                                                         |

---

## Patterns this repo uses

### Query by role and accessible name

```tsx
screen.getByRole('button', { name: /attachments/i });
```

Not `container.querySelector('.pdf-attachments-toggle')`. Two reasons: class names are
free to change, and querying by accessible name means **accessibility regressions fail the
build for free**. That is how the missing labels on both Kendo dropdowns surfaced — as test
failures, not as an audit finding.

### Mock at the boundary

Kendo's `PDFViewer` is replaced with a stand-in exposing only `pages` and `document` —
the entire contract our code depends on:

```tsx
vi.mock('@progress/kendo-react-all', async () => {
    /* … */
});
```

This tests our code without testing Telerik's, and a version bump that drops those fields
fails loudly instead of blanking the screen. **Do not write tests that would still pass if
you deleted your own file and kept the library** — those test the vendor, not you.

### Fixtures, never real data

`src/test/fixtures.ts` builds cases and attachments by hand, deliberately _not_ importing
`src/data/pdf-metadata.json`, so editing real content never breaks a test. The shape is
typed, so TypeScript catches drift if an interface changes.

### One contract across variants

Both comparison suites (`CaseSelector/variants.test.tsx`, `PdfAttachments/placements.test.tsx`)
run a shared contract over every implementation with `describe.each`, then record where
they deliberately diverge. This makes a design comparison _executable_ — evidence rather
than a comment someone has to take on trust.

Both suites turned up a finding just by being written: each variant needed its own adapter
to read what it displays, which is itself proof they are not drop-in replacements.

### Split tests along the code's seams

When `PdfAttachments` was split into a data hook and three presentational components, the
tests split the same way — `useAttachments.test.ts` covers parsing and blob lifecycle;
each placement's suite gets a finished list and only checks what it draws. Neither repeats
the other.

---

## Worked example

`src/components/PdfAttachments/BottomBarAttachments.test.tsx` — four tests, one from each
category above:

| Test                                                                    | Category       | Why it exists                                                                          |
| ----------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `renders nothing when the document has no attachments`                  | Contract       | The empty case is the _common_ case; a stray empty bar would ship unnoticed            |
| `starts collapsed, showing only a count`                                | Decision       | Collapsed-by-default is deliberate, and the count must be readable without interacting |
| `reveals the attachments when the row is clicked, and hides them again` | Contract       | The core interaction, both directions — closing is where toggles usually break         |
| `keeps the decorative icon out of the accessible name`                  | Silent failure | Invisible to the eye; only detectable here                                             |

### What is deliberately absent

No test for the accent tint, the 44 px tap target, the paperclip's position, or `100dvh`.
Two reasons: jsdom cannot see them, and they are meant to change freely.

**A test over something you intend to tweak is a tax, not a safety net.**

---

## Known gaps

- **No real-browser layer.** Playwright would catch exactly the four bugs listed above.
  Worth adding if this graduates from experiment to product; hard to justify while the
  whole repo is a viewer comparison.
- **No visual regression testing**, for the same reason.
- **Coverage is scoped** to `src/components/**/*.tsx` and `src/hooks/**/*.ts`; barrel files
  and components not rendered on this branch are excluded. See `vite.config.ts`.
