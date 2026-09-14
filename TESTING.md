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

| Layer | What it is | What it gives you |
|---|---|---|
| **Vitest** | Test runner, Vite-native — same transform pipeline as the build | `describe/it/expect`, the `vi.*` fake toolkit, watch mode, v8 coverage |
| **jsdom** | A fake DOM in Node | Components render — but **no layout, no paint, no media** |
| **Testing Library** | `render`, `renderHook`, `screen` | Query the DOM the way a user perceives it, not by CSS class |
| **user-event** | Realistic interaction | A click fires `pointerdown → mousedown → focus → click`, not one synthetic event |
| **jest-dom** | Extra matchers | `toBeInTheDocument`, `toHaveAccessibleName`, `toHaveAttribute` |

Config lives in `vite.config.ts` under `test:`; shared setup in `src/test/setup.ts`.

---

## How to decide what to test

The useful question is **not** "what does this code do?" — that produces tests that
restate the implementation and catch nothing. Ask:

> **What could break here without anyone noticing?**

A bug that throws, blanks the page, or fails the build does not need a test; you will find
it in seconds. Tests earn their keep on failures that *look fine*.

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
  looks *identical* and screen readers begin announcing "paperclip Attachments 1".
- **Every player pointing at the first attachment.** Three players render, the UI looks
  right, and it is wrong only once someone presses play.

### 3. Bugs you actually hit

Every real bug becomes a permanent test. Not predicted — earned. The `usePdfStamp` leak,
the toolbar count nested inside its label, the popover with no width: all of those tests
exist because the bug happened.

### 4. Decisions someone could innocently undo

Collapsed-by-default is a *choice*. Someone could reasonably think "why not open it, it is
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

| Bug | Why jsdom could not see it |
|---|---|
| Popover clipped by `.k-toolbar { overflow: hidden }` | No layout, so no clipping |
| Popover painted behind the PDF (stacking context) | No paint, so no z-order |
| Count badge clipped away with its `clip-path` parent | No layout |
| Audio scrubber collapsed in a content-sized popover | No layout, no media |

The first two are the instructive ones. The tests asserted
`expect(screen.getByRole('dialog')).toBeInTheDocument()` and passed the **entire time** the
popover was invisible in a real browser.

> **A test that cannot fail for the reason you care about is worth nothing** — and worse
> than nothing, because it buys false confidence.

### What to do instead

When a device bug turns up, pin the **mechanism**, not the appearance. The mechanism is
checkable in jsdom; the appearance is not.

| Instead of | Assert |
|---|---|
| "the popover is visible" | it is **not a descendant** of the toolbar (escaped the stacking context) |
| "the scrubber shows" | an explicit **width is applied** |
| "the badge is on screen" | the count is **not inside** the visually-hidden label |

### The division of labour

- **Tests** own logic, structure, contracts, accessible names, lifecycle. They catch what
  eyes cannot: a leak is invisible, a stale closure looks fine.
- **A real device** owns layout, paint, stacking, and media. Nothing in Node substitutes.

Neither is a failure of the other. Knowing which tool covers which is the whole skill.

---

## Tools, by the problem they solve

| Problem | Tool |
|---|---|
| A dependency will not run in jsdom | `vi.mock` — Kendo's `PDFViewer`, `pdf-lib` |
| A mock factory needs mutable state | `vi.hoisted` — `vi.mock` hoists above imports, so shared state must too |
| jsdom lacks a browser API | `vi.stubGlobal` — `URL.createObjectURL`, `fetch` |
| Watch a real function | `vi.spyOn` — `console.error` on failure paths |
| Record a callback | `vi.fn` — every `onPageChange`, `onSelectCase` prop |
| Testing a hook, not a component | `renderHook` |
| Something resolves asynchronously | `waitFor` |
| One contract, several implementations | `describe.each` |

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
vi.mock('@progress/kendo-react-all', async () => { /* … */ });
```

This tests our code without testing Telerik's, and a version bump that drops those fields
fails loudly instead of blanking the screen. **Do not write tests that would still pass if
you deleted your own file and kept the library** — those test the vendor, not you.

### Fixtures, never real data

`src/test/fixtures.ts` builds cases and attachments by hand, deliberately *not* importing
`src/data/pdf-metadata.json`, so editing real content never breaks a test. The shape is
typed, so TypeScript catches drift if an interface changes.

### One contract across variants

Both comparison suites (`CaseSelector/variants.test.tsx`, `PdfAttachments/placements.test.tsx`)
run a shared contract over every implementation with `describe.each`, then record where
they deliberately diverge. This makes a design comparison *executable* — evidence rather
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

| Test | Category | Why it exists |
|---|---|---|
| `renders nothing when the document has no attachments` | Contract | The empty case is the *common* case; a stray empty bar would ship unnoticed |
| `starts collapsed, showing only a count` | Decision | Collapsed-by-default is deliberate, and the count must be readable without interacting |
| `reveals the attachments when the row is clicked, and hides them again` | Contract | The core interaction, both directions — closing is where toggles usually break |
| `keeps the decorative icon out of the accessible name` | Silent failure | Invisible to the eye; only detectable here |

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
