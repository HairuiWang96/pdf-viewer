# PDF library comparison — pdf.js vs. pdf-lib vs. pyHanko

| | **pdf.js** (`pdfjs-dist`) | **pdf-lib** | **pyHanko** |
|---|---|---|---|
| **What it's for** | *Reading* / rendering existing PDFs | *Creating* / editing PDFs | *Cryptographically signing* PDFs |
| **Direction** | PDF → pixels on screen | Bytes in → modified bytes out | Existing PDF → signed PDF |
| **Language** | JavaScript (browser) | JavaScript (browser or Node) | Python |
| **Used where in this project** | Powers both `react-pdf` and KendoReact's viewer — every page rendered on screen goes through it | `usePdfStamp.ts` — draws the "Internal Use Only" stamp text onto a copy of the PDF before download; also used to generate 7 of the 8 QA test PDFs | Not in the app at all — used standalone to build the one signed test PDF (`case-digital-signature.pdf`) |
| **Analogy** | A PDF *reader* | A PDF *editor/generator* | A notary stamp |

**One-line version:** pdf.js opens and displays PDFs (the engine behind both viewers being compared); pdf-lib builds and modifies PDFs (used both by the app itself for stamping, and to generate the QA test files); pyHanko was a one-off outside tool because neither of the above can do real cryptographic signing.

**Nuance:** pdf-lib can create simple, unsigned form fields, bookmarks, and file attachments — which is why it could build the audio-attachment, forms, bookmarks, and font test PDFs. It just can't cryptographically sign a document; that's pyHanko's whole job.

**"pdf.js" vs. "pdfjs-dist" — aren't those two different things?** No, same library. "pdf.js" is the name of the open-source project (Mozilla's PDF renderer — also what powers Firefox's built-in PDF viewer). "pdfjs-dist" is the npm package name that project is published under, since `package.json` and import statements need an actual installable package name, not just a project name. Installing `pdfjs-dist` *is* installing pdf.js.

## How the four viewer branches package that engine

| Branch | What it actually is | Where it renders | Engine underneath |
|---|---|---|---|
| `kendo-pdf-viewer` | A React component (npm package) | The app's own DOM | pdf.js |
| `react-pdf` | A React component (npm package) | The app's own DOM | pdf.js |
| `pdfjs-viewer` | A standalone HTML **application** | An iframe — it has to be | pdf.js |
| `iframe-viewer` | Nothing shipped at all | An iframe | Whatever the browser provides |

**Why one of them uses an iframe and the others don't** is packaging, not rendering. KendoReact and react-pdf are *components*: you `import` them and they join the React tree, rendering into the app's own DOM. Mozilla's viewer isn't a component — it's a complete separate web page (`viewer.html` with its own JS and CSS). You can't `import` an HTML page into React, so you embed it, and an iframe is the mechanism for putting one page inside another.

**The top three all run the same engine.** Kendo wraps pdf.js in a commercial component, react-pdf wraps it in an open-source one, Mozilla wraps it in a finished UI. Only `iframe-viewer` is genuinely different: it ships no engine and borrows whatever the browser has — which is why it renders via PDFium on Chrome, Adobe's engine on Edge, and breaks on mobile WebKit.

**Why that last one broke on mobile, and the PDF.js viewer doesn't:** mobile WebKit refuses to run its native PDF plugin inside an iframe. That restriction applies to *displaying a PDF*, not to iframes. The PDF.js viewer never asks the browser to display a PDF — it asks for an ordinary HTML page, then fetches the PDF as bytes and paints each page onto a `<canvas>`, with an invisible text layer for selection/search and real HTML elements for links and form fields. No conversion to HTML happens; the PDF's own drawing instructions are replayed onto canvas. Since the restricted code path is never touched, mobile behaves like desktop.
