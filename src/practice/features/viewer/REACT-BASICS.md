# React Basics, Through Our PDF Viewer

Oct 16, 2026 · @Hairui Wang

Five React ideas explain everything our fit-to-width code does: rendering, state, effects, refs and custom hooks. Each one below is shown with `useFitWidthZoom` and `PDFDocViewer` from the practice folder.

## 1. Rendering: a component is a function React calls again and again

A component is a plain function that returns what should be on screen. React calls it once to show it, then calls it **again** every time something it depends on changes. Each call is a *render*.

- Every line in the component body runs on every render, including the code of any hook it calls.
- `PDFDocViewer` re-renders on every zoom change and every store update it reads. That is normal, and cheap.
- What is **not** re-run on every render: effects (section 3), and values kept in `useMemo` (like `viewerData`) or refs (section 4).

## 2. State: a value whose change re-renders

`useState` gives a value and a setter. Calling the setter with a new value makes React render again with it.

```ts
const [zoom, setZoom] = useState(isMobile ? 0.5 : 1);
```

- `zoom` is passed to Kendo, so `setZoom(0.47)` redraws the PDF at 47%.
- Kendo's + and − buttons don't change the zoom themselves: they call `onZoom`, our `handleZoom` calls `setZoom`, and the new value flows back in. That loop is a *controlled* component.
- Setting the **same** value again (e.g. 0.47 → 0.47) doesn't re-render: React skips it.

## 3. Effects: run after a render, only when a dependency changes

`useEffect(fn, [deps])` is for work outside React, like attaching a `ResizeObserver` to the page. Three rules:

1. It runs once after the **first** render.
2. After later renders it runs **only if something in `[deps]` changed**. Otherwise React skips it, however often the component re-renders.
3. The function it returns is the *cleanup* (`observer.disconnect()`). It runs before the effect runs again, and when the component goes away.

The resize watcher's list is `[viewerRef, documentKey, isMobile, fitToWidth]`. Pressing + changes none of them, so the watcher stays attached and nothing re-runs.

**Why `documentKey` is `viewerData`.** The effect can only attach to a viewer that exists, so it must re-run when the viewer appears:

| Moment | Viewer on the page? | Effect |
| --- | --- | --- |
| Page opens, PDF still downloading | No, an empty `<div />` | Runs, finds nothing, gives up |
| PDF bytes arrive, `viewerData` changes | Yes | Runs again, attaches the watcher |
| Kendo finishes parsing, calls `onLoad` | Yes | Skipped; `handleLoad` does the first fit |
| Phone turns | Yes | Skipped; the attached watcher refits |

**The layout-switch effect** (`[isMobile, fitToWidth]`) refits when mobile ↔ desktop. Without it, a switch can restart the watcher at the new width, so the following resize looks like "no change".

## 4. Refs: remember something without re-rendering

`useRef` gives a box (`.current`) that keeps its value between renders. Changing it does **not** re-render, which suits values only code reads, never the screen.

- `viewerRef` is a handle to Kendo's viewer. `ref={viewerRef}` makes Kendo fill it in, and then `viewerRef.current.document` gives page 1's width and `viewerRef.current.element` gives the box to measure.
- `zoomedByHand` remembers whether the user zoomed with the buttons. A desktop resize reads it to decide whether to refit.

Rule of thumb: if changing it should change the screen, use state; if only code reads it, use a ref.

## 5. Custom hooks: component code moved into a function

A custom hook is a function whose name starts with `use` and which calls other hooks. Calling it works **as if its code were written inside the component** that calls it. Its state, refs and effects belong to that component and follow the rules above.

```ts
const { zoom, handleZoom, fitToWidth } = useFitWidthZoom(viewerRef, isMobile, viewerData);
```

- `zoom` → Kendo's `zoom` prop (what to show)
- `handleZoom` → Kendo's `onZoom` (the + and − buttons)
- `fitToWidth` → called from `handleLoad`, Kendo's `onLoad` (the first fit for each document)

Hooks must run in the same order every render, so they go before any early `return` (that's why `useMemo` and the hook sit above `if (!viewerData) return <div />`).

## Putting it together

From opening a document to turning the phone, each idea plays its part:

1. The loader puts the PDF's bytes in the store, so `PDFDocViewer` **re-renders** with `document` set.
2. `useMemo` makes `viewerData`, a copy for Kendo. It's new, so the resize **effect** re-runs.
3. Kendo's box appears and fills `viewerRef` (a **ref**); the effect attaches the watcher to it.
4. Kendo finishes parsing and calls `onLoad`; `fitToWidth` measures and calls `setZoom` (**state**), and the page fits.
5. The phone turns: the attached watcher sees a new width and refits. No effect re-runs.

**`void fitToWidth()`** starts an `async` function without waiting for it. Effects can't wait, and `fitToWidth` delivers its result by calling `setZoom` itself, so the Promise is thrown away on purpose. The fit still runs in full.

**Further reading** on [react.dev](https://react.dev/learn): *Render and Commit*, *State as a Snapshot*, *Synchronizing with Effects*, *Referencing Values with Refs*, *Reusing Logic with Custom Hooks*.
