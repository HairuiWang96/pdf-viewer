# Testing

> **This file describes the tests on the `iframe-viewer` branch.**
> Each branch keeps its own copy, because each branch renders PDFs a different
> way. See [Three branches, three suites](#three-branches-three-suites).

---

## Why this project has tests at all

This is an experiment. The goal is not shipping — it is to **find out how three
PDF-rendering approaches actually behave** and to have something concrete to
compare.

So the tests here are *characterization tests*: they write down what each
approach does, in a form that runs. Where two branches differ, the difference
shows up as a test that exists on one branch and not the other, or one that
asserts something different. That is more honest than a comparison written from
memory.

Treat coverage numbers as a sanity check, not the point.

---

## Three branches, three suites

| Branch             | Renders the PDF with                          | Viewer component    |
| ------------------ | --------------------------------------------- | ------------------- |
| `react-pdf`        | PDF.js drawing into `<canvas>` (react-pdf)     | `PdfViewer`         |
| `iframe-viewer`    | The browser's own viewer inside an `<iframe>`  | `PdfViewer` (10 lines) |
| `kendo-pdf-viewer` | KendoReact PDF Viewer component                | `KendoPdfViewer`    |

**Test suites are per-branch and are not merged.** Two reasons:

1. The viewer component is different on each branch, so viewer tests cannot be
   shared.
2. Keeping them separate is what makes the comparison legible — you can read
   one branch's suite and see what that approach costs.

### What is shared, and what is not

Most of the app is the same on all three branches. Only the viewer differs.

| Area                                    | Same on all three? | Notes |
| --------------------------------------- | ------------------ | ----- |
| `CaseSelector` + its 3 dropdown variants | yes                | Identical files |
| `Layout`, `PdfDetails`                   | yes                | Identical or near-identical |
| `usePdfViewer`, `useDetailsPanel`        | yes                | Case selection and panel state |
| The viewer component                     | **no**             | The whole point of the comparison |
| `usePdfStamp`, `usePdfThumbnails`        | **no**             | Only where that branch needs them |
| `ThumbnailSidebar`, `PageNavigation`     | **no**             | Unused on `iframe-viewer` (see [Coverage](#coverage)) |

**Practical consequence:** tests for the shared core should stay deliberately
similar across branches. If a shared test passes on one branch and fails on
another, that is a real finding, not noise.

### Careful: two different "threes"

Easy to mix up, so stated plainly:

- **Three branches** — three ways of *rendering a PDF* (the table above).
- **Three dropdown variants** — `CustomDropdown`, `KendoDropDownList`,
  `KendoComboBox`, three ways of *picking a case number*. All three exist on
  **every** branch, switched by the `ACTIVE_VARIANT` constant in
  [`CaseSelector.tsx`](src/components/CaseSelector/CaseSelector.tsx).

They are unrelated comparisons that happen to both have three options.

---

## Quick start

```bash
npm test              # run everything once
npm run test:watch    # re-run on save while developing
npm run test:coverage # run + print a coverage table
```

Coverage also writes `coverage/index.html`. Open it in a browser for a
line-by-line view of what ran — far more useful than the percentage.

> **Node 20+ required.** If `npm test` fails with
> `SyntaxError: Unexpected token ?`, an old Node is on your `PATH`.
> Run `nvm use 22` first.

---

## What kind of tests these are

| Layer         | Checks                                    | Speed   | Here? |
| ------------- | ----------------------------------------- | ------- | ----- |
| **Unit**      | One function or hook in isolation         | ms      | yes   |
| **Component** | One component renders and reacts to input | ms      | yes   |
| **E2E**       | The whole app in a real browser           | minutes | no    |

No real browser is involved. Tests render into **jsdom**, a fake DOM in Node.

### The tools

| Tool                            | Its one job                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| **Vitest**                      | The runner. Finds `*.test.ts(x)`, runs them, reports pass/fail.     |
| **jsdom**                       | A fake browser DOM so React has something to render into.           |
| **@testing-library/react**      | Renders components and finds elements *the way a user would*.       |
| **@testing-library/user-event** | Simulates real interaction — Tab, Enter, arrow keys, clicks.        |
| **@testing-library/jest-dom**   | Extra assertions: `toBeVisible()`, `toHaveFocus()`.                 |
| **@vitest/coverage-v8**         | Measures which lines ran; fails the run below the threshold.        |

Vitest rather than Jest because this is a Vite project: same config file, same
transform pipeline, no second build setup.

---

## Where things live

```
src/
  test/
    setup.ts      runs before every test file
    fixtures.ts   fake case data shared by all suites
  hooks/
    usePdfViewer.ts
    usePdfViewer.test.ts        ← test sits beside the code it tests
  components/
    CaseSelector/
      CustomDropdown.tsx
      CustomDropdown.test.tsx
```

**Convention: a test file lives next to the file it tests**, named
`<name>.test.ts` for plain logic, `<name>.test.tsx` when it renders JSX.

### `src/test/setup.ts`

Runs before every test file:

1. Loads the extra `jest-dom` assertions.
2. Unmounts rendered components after each test, so state never leaks.
3. Stubs two browser APIs jsdom lacks but our code calls —
   `window.matchMedia` (used by `useDetailsPanel`) and `Element.scrollIntoView`
   (used by `CustomDropdown`). Without these the tests throw.

### `src/test/fixtures.ts`

Fake `PdfMetadata` objects. Tests deliberately do **not** import
`src/data/pdf-metadata.json`, so editing real content cannot break unrelated
tests. `makeCase({ ... })` builds one case with overrides; `threeCases` is a
ready-made list of three.

Keeping fixtures identical across branches is what lets the shared-core suites
be compared line for line.

---

## How to write a test

Every test has the same shape: **render → act → assert.**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomDropdown from './CustomDropdown';
import { threeCases } from '../../test/fixtures';

describe('CustomDropdown', () => {
  it('opens when the trigger is activated with Enter', async () => {
    const user = userEvent.setup();
    const onSelectCase = vi.fn();               // a stand-in we can inspect

    // 1. RENDER — put the component into the fake DOM
    render(
      <CustomDropdown
        cases={threeCases}
        selectedCaseId={null}
        onSelectCase={onSelectCase}
      />,
    );

    // 2. ACT — do what a keyboard user would do
    await user.tab();                            // focus the trigger
    await user.keyboard('{Enter}');

    // 3. ASSERT — state what should now be true
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
```

### Find elements by role, not by class

```tsx
screen.getByRole('button', { name: 'Select case number' });  // do this
container.querySelector('.custom-dropdown-trigger');         // avoid this
```

The single most important habit here, and not merely style:

- **Class names are implementation.** Renaming one should not break a test.
- **Roles and labels are the contract.** They are what assistive technology
  uses, so a test written this way doubles as a Section 508 check — if the test
  cannot find a control by its accessible name, a screen reader cannot either.

| Query            | Use when                                                        |
| ---------------- | --------------------------------------------------------------- |
| `getByRole`      | Almost always. Buttons, listboxes, options.                      |
| `getByLabelText` | Form fields.                                                     |
| `getByText`      | Static copy with no role of its own.                             |
| `queryBy…`       | Asserting something is **absent** (returns null, does not throw). |
| `findBy…`        | Something appears asynchronously (returns a promise).            |

### Prefer `user-event` over `fireEvent`

`user.click()` fires the full sequence a browser does — pointer down, focus,
pointer up, click. `fireEvent.click()` fires one synthetic event and can pass
while the real interaction is broken. Always `await` user-event calls.

### Test behaviour, not implementation

Write assertions a product person could read — "returns focus to the trigger
after selecting", not "calls setState twice".

---

## What this branch tests

Grouped by whether it is shared with the other branches.

### Shared core — keep these aligned across branches

| Target            | Why it earns tests |
| ----------------- | ------------------ |
| `usePdfViewer`    | Every case-selection and stamp rule. Pure logic, no DOM. |
| `useDetailsPanel` | Breakpoint detection, open/close state. |
| `CustomDropdown`  | ~150 hand-written lines of keyboard and ARIA handling. Breaks silently — nobody notices dead arrow keys by clicking. |
| Dropdown variants | One suite run against all three, via `describe.each`. |
| `PdfDetails`      | Sections stay hidden until a case is chosen; single vs multiple case. |
| `Layout`          | Skip link and mobile toggle — both accessibility features. |

### Branch-specific

| Target      | On this branch |
| ----------- | -------------- |
| `PdfViewer` | Ten lines. Asserts the `<iframe>` gets the right `src` and an accessible `title`. Everything inside the frame is the browser's, and unreachable — see [limits](#what-these-tests-can-never-catch). |

The other branches replace that last row entirely: `react-pdf` tests canvas page
rendering and load callbacks; `kendo-pdf-viewer` tests the KendoReact viewer's
own props and toolbar.

### The dropdown-variant suite

`variants.test.tsx` runs a shared behavioural contract against all three
dropdowns with `describe.each`, then records where they diverge.

Known gaps are marked `it.fails(...)`, so the suite stays green while still
documenting the difference. If a future Kendo release closes one, `it.fails`
starts failing and tells us to update these notes.

#### What it found

| Finding | Which variant |
| ------- | ------------- |
| **The placeholder is a selectable list item.** `defaultItem` is not a true placeholder — Kendo renders it into the popup as a clickable row marked `k-selected`. A user can pick "Please select a case number" as their answer. | `KendoDropDownList` |
| **That row is not exposed as an option.** It is a bare `<div>` with no `role="option"`, so the open list has four clickable rows but only three options. A mouse user can reach something a screen-reader user cannot. | `KendoDropDownList` |
| **No accessible name.** Both Kendo widgets render `role="combobox"` with no `aria-label` and no associated `<label>`, so a screen reader announces the control without saying what it selects. `CustomDropdown` sets `aria-label="Select case number"`. | both Kendo |
| **The field accepts free text.** A ComboBox is an editable input, so a user can type anything into what should be a fixed list of case numbers. | `KendoComboBox` |
| **A real placeholder, and the input stays empty.** The behaviour we actually wanted. | `KendoComboBox` |

#### A finding from writing the suite itself

The shared half needs a per-variant **adapter** just to read what the control
is displaying, because the three render entirely different DOM:

| Variant | Renders |
| ------- | ------- |
| `CustomDropdown` | a `<button>` whose text is the current value |
| `KendoDropDownList` | a `<span role="combobox">` with the value as text |
| `KendoComboBox` | an `<input>` with a real `placeholder` attribute |

That the adapter is necessary at all is part of the comparison: **these are not
drop-in replacements for one another.** Switching variants is not a one-line
change to `ACTIVE_VARIANT` — anything that queries the control has to change
too.

---

## Coverage

Thresholds live in [`vite.config.ts`](vite.config.ts): **80%** for statements,
branches, functions and lines. Dropping below any of them fails
`npm run test:coverage`.

**Measured:** `src/components/**/*.tsx` and `src/hooks/**/*.ts`.

| Excluded                               | Why |
| -------------------------------------- | --- |
| `**/index.ts`                          | Barrel re-exports. No logic. |
| `ThumbnailSidebar/`, `PageNavigation/` | Not imported anywhere on **this** branch — leftovers from before the switch to a single iframe. Excluded so dead code does not drag the number down. They are live on the other two branches, where they should be tested and not excluded. |

### 80% is a floor picked for an experiment, not a standard

Most components here are presentational, so rendering one covers most of its
lines. The number is easy to hit and says little by itself.

What matters is that the **branching** code is covered: `usePdfViewer`'s
selection rules and `CustomDropdown`'s key handling. Read the HTML report and
look for uncovered *branches*, not a bigger percentage.

---

## What these tests can never catch

Worth stating, because it marks the line between this suite and real testing —
and because it is itself part of the three-way comparison.

- **Anything visual.** jsdom has no layout engine and CSS is not even loaded
  (`css: false`). A test cannot tell you the dropdown renders off-screen.
- **PDF rendering.** No PDF engine in jsdom. Whether a page actually displays is
  not testable here — on *any* of the three branches.
- **The iframe interior.** A separate document containing the browser's own
  viewer. Out of reach for both CSS and tests. This is the sharpest difference
  between the branches: `react-pdf` and `kendo-pdf-viewer` render into your own
  DOM, so their output is at least inspectable; the iframe's is not.
- **The mobile iframe limitation** documented in
  [`PdfViewer.tsx`](src/components/PdfViewer/PdfViewer.tsx) — mobile browsers
  render only the first page inside an iframe. Real device only.
- **Real screen-reader behaviour.** Role and label assertions catch roughly the
  first third of accessibility problems. Whether the dropdown is genuinely
  usable with VoiceOver or NVDA needs a human.

---

## Adding a test

1. Create `<name>.test.tsx` beside the file you are testing.
2. Import fixtures from `src/test/fixtures.ts` rather than real data.
3. Follow render → act → assert.
4. Query by role and accessible name.
5. `npm run test:watch` while you work.
6. `npm run test:coverage` before committing.
7. If it covers shared code, consider whether the other two branches need the
   same test.
