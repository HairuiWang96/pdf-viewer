// Copy of the other project's server.ts (at its root; here it sits at the
// root of the practice folder). Nothing here runs it; the typecheck and lint
// still run against it.
//
// Changed from the original: the import paths. doc-viewer's './src/server/…'
// is './server/…' here, as the practice folder stands in for doc-viewer's
// src. server/mockdata.json is a copy too (JSON has no comments, so it is
// noted here). Also added the learning comments on the JSON import,
// process.cwd(), express.static, the catch-all route and app.listen, and
// the "More detail" section at the end.
import './server/telemetry/instrumentation.ts';
import express, { type NextFunction, type Request, type Response } from 'express';
// `with { type: 'json' }` is an import attribute: "this file is JSON data,
// not code; load it as data".
//   - Why needed: ‼️a normal import loads a JavaScript file and runs it. Node
//     needs telling how to treat a .json file; without this it is an error.
//   - Why the extension is not enough: a safety rule. On the web the server,
//     not the file name, decides what a file is. If JavaScript came back
//     instead of JSON, a plain import would run it. With type: 'json', Node
//     or the browser checks it really is JSON and refuses to run it as code.
//   - What you get: `mockdata` is the file's content, already parsed into a
//     normal value (here the list, so mockdata[0].caseNumber is
//     '2026-CV-10452'). No JSON.parse or fetch needed.
// `with` is the current keyword; older code wrote `assert { type: 'json' }`,
// since removed. Browser code built by Vite can import .json without it,
// ‼️because Vite converts the JSON itself; server.ts runs in Node directly,
// with no Vite, so it needs it.
import mockdata from './server/mockdata.json' with { type: 'json' };
import path from 'node:path';

const isProd = process.env.NODE_ENV === 'production';
// process.cwd() is the folder you started the server from (not where this
// file is). path.resolve turns 'public/mocks' into a full path from it,
// which sendFile's `root` needs. path.resolve('dist') below does the same,
// implicitly. Catch: start the server from another folder and both paths
// are wrong; npm scripts always run from the project root, so usually fine.
// 'mocks' in production: a build copies public/ to the top of dist/ (likely,
// deploy setup not seen).
const mockRoot = path.resolve(process.cwd(), isProd ? 'mocks' : 'public/mocks');

const app = express();
const router = express.Router();
const port = Number(process.env.PORT ?? 5174);
const dist = path.resolve('dist');

app.use((req, _res, next) => {
  console.info(`[doc-viewer ui] [${new Date().toISOString()}] INCOMING_REQUEST url=${req.originalUrl}`);
  next();
});

router.get('/api/health', (req: Request, res: Response): void => {
  console.info(`[doc-viewer ui] [${new Date().toISOString()}] HEALTH_CHECK method=${req.method} path=${req.path} satus=200`);
  res.status(200).json({ status: 'ok', app: 'ui/doc-viewer', version: '0.1.0' });
});

router.get('/v1/doc-viewer/document/:id', (req: Request, res: Response): void => {
  console.info(`[doc-viewer ui] [${new Date().toISOString()}] DOCUMENT method=${req.method} path=${req.path} status=200`);
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.sendStatus(400);
    return;
  }

  const known = ['123456', '987654', 'abcdef', '123lag', '123sml'];
  const isKnown = known.includes(id);
  if (!isKnown) {
    res.sendStatus(400);
    return;
  }

  res.sendFile(id, {
    root: mockRoot,
  });
});

router.get('/v1/doc-viewer/document/metadata/:id', (req: Request, res: Response): void => {
  console.info(`[doc-viewer ui] [${new Date().toISOString()}] METADATA method=${req.method} path=${req.path} status=200`);
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.sendStatus(400);
    return;
  }

  const known = ['123456', '987654', 'abcdef', '123lag', '123sml'];
  const isKnown = known.includes(id);
  if (!isKnown) {
    res.sendStatus(400);
    return;
  }

  let mock;
  switch (id) {
    case '123456':
      mock = mockdata[1];
      break;
    case '987654':
      mock = [mockdata[2]];
      break;
    case 'abcdef':
      mock = [mockdata[0]];
      break;
    default:
      mock = [mockdata[0]];
      break;
  }

  res.status(200).json(mock);
});

// "If a request asks for a file that exists in dist, send that file as it
// is." dist is the folder `npm run build` makes: index.html,
// assets/index-….js and .css, and whatever was in public/ (e.g.
// FederalCourtsPrimer.pdf).
// Static = sent unchanged from disk, no code builds it. The opposite is a
// dynamic route like /document/metadata/:id, where code builds each answer.
// The router sits under /doc-viewer, so:
//   /doc-viewer/assets/index-a1b2c3.js   → dist/assets/index-a1b2c3.js
//   /doc-viewer/FederalCourtsPrimer.pdf  → dist/FederalCourtsPrimer.pdf
//                                          (the url in mockdata.json)
//   /doc-viewer/nothing-here.js          → no file: on to the next route
// Order matters: Express checks routes top to bottom, first answer wins. The
// API routes above go first, then real files here, then /{*splat} below
// catches the rest (index.html for page addresses, 404 for missing files).
// express.static is a built-in piece of Express: the standard way to serve a
// built frontend.
router.use(express.static(dist));

// The catch-all route: answers whatever nothing above answered (it is last).
//   - '/{*splat}' is Express 5 for "match any path": *splat captures the rest
//     of the address (splat is just its name), and { } makes it optional, so
//     /doc-viewer/ itself matches too. Express 4 wrote '*'.
//   - next: the third argument, "hand this to Express"; used below.
router.get('/{*splat}', (req: Request, res: Response, next: NextFunction): void => {
  // 'SAP' is probably a typo for SPA (single-page app).
  console.info(`[doc-viewer ui] SAP: ${req.path}`);
  // 404 when the address starts with /api/ (an API that does not exist) or
  // has a file extension (path.extname('/x.js') is '.js': it looked like a
  // file, and express.static did not find it).
  if (req.path.startsWith('/api/') || path.extname(req.path)) {
    res.sendStatus(404);
    return;
  }

  // Anything left is a page address, e.g. /doc-viewer/case/42: send
  // index.html. This is a single-page app: there is one real HTML page, and
  // React reads the address in the browser and shows the right screen.
  //
  // Why it is needed: clicking a link inside the app does not ask the server
  // for anything. React only changes the address in the bar (with the
  // browser's history API) and swaps the screen itself. ‼️But on a reload, or
  // a pasted link, the browser asks the server for that exact address. There
  // is no file called /doc-viewer/case/42, so without this route the server
  // would answer 404. Sending index.html instead lets React start, read the
  // address and show the right screen. The first page works either way,
  // because /doc-viewer/ is index.html already. (Step by step: see "More
  // detail" at the end of the file.)
  //
  // If sending fails (e.g. no dist/index.html because nobody built),
  // next(err) passes the error to Express, which answers 500 instead of
  // leaving the request hanging.
  res.sendFile(path.join(dist, 'index.html'), err => {
    if (err) next(err);
  });
});

app.use('/doc-viewer', router);

// Starts the server: until this runs, nothing answers. It waits ("listens")
// for requests on:
//   - port: process.env.PORT if set (the hosting platform usually sets it),
//     else 5174, the port vite.config.ts's proxy sends API requests to.
//     Nothing listening there is the "ECONNREFUSED 127.0.0.1:5174" error.
//   - '0.0.0.0': every network address of the machine, not only localhost,
//     so other devices and containers can reach it.
// The callback runs once the server is ready, and logs the port.
app.listen(port, '0.0.0.0', (): void => {
  console.info(`[doc-viewer ui] listening on port ${port}`);
});

// ---------------------------------------------------------------------------
// More detail: why the catch-all route sends index.html
// (/doc-viewer/case/42 is just an example address; the idea is the same for
// any page address React handles.)
//
// 1. Why the file is not there
//
//    On an old-style website every page is a real file:
//      about.html    → /about.html
//      contact.html  → /contact.html
//
//    A React app is different. `npm run build` makes only ONE HTML file,
//    plus the JavaScript:
//      dist/
//        index.html          ← the only page
//        assets/index-….js   ← ALL the screens are inside this code
//
//    The "screens" are not files; they are React components inside the
//    JavaScript. An address like /doc-viewer/case/42 is just a rule in that
//    code: "when the address is /case/42, show the Case screen for 42". So
//    the server finds no file called case/42; it was never made. Only the
//    JavaScript knows what the address means.
//
// 2. Why sending index.html fixes it
//
//    index.html is almost empty, roughly:
//      <div id="root"></div>
//      <script src="/doc-viewer/assets/index-….js"></script>
//
//    That <script> line is what starts React. So when the server sends
//    index.html for ANY page address:
//      1. The browser gets index.html. The address bar still says
//         /doc-viewer/case/42: sending a different file does not change it.
//      2. The browser loads the <script>, and React starts.
//      3. React reads the address bar (window.location), sees /case/42, and
//         draws the Case screen into <div id="root">.
//
// 3. Reload, without and with the route
//
//    step                         without catch-all       with catch-all
//    you reload /case/42          browser asks server     browser asks server
//    server looks for case/42     not found → 404 page,   not found → sends
//                                 React never starts      index.html
//    result                       error page              React starts, reads
//                                                         /case/42, shows the
//                                                         right screen
//
//    Clicking a link inside the app never gets this far: React changes the
//    address itself (history API) without asking the server.
//
// In short: the server does not know the app's pages, only React does. Its
// job is "always hand over index.html; React works out the rest".
