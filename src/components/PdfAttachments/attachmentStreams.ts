/**
 * Locates every embedded file in a document — without reading any of them.
 *
 * This is the discovery half of attachments, and it deliberately stops short
 * of the bytes. Walking the object graph is cheap and tells us everything an
 * indicator needs: the filename, the declared size and type, and that the file
 * is there at all. Decoding is what costs, and it is left to `readAttachment`
 * to do per file, on demand. See PdfAttachment for why that split exists.
 *
 * ── The two places a PDF can keep a file ──
 *
 * 1. /Names /EmbeddedFiles on the catalog. The attachment model proper — what
 *    a viewer means by "this document has attachments". `@libpdf/core` has a
 *    first-class API for this, so we use it rather than walking by hand: its
 *    `getAttachments()` lists names, sizes and declared types without reading
 *    a single file, and `getAttachment(name)` reads one when asked.
 *
 * 2. A RichMedia annotation's own /Assets tree. The Flash era: the annotation
 *    names a player .swf and passes it the audio through FlashVars. Nothing
 *    treats a file in here as an attachment — by the spec's own model the
 *    document has none — which is why every viewer showed nothing for it.
 *    Acrobat plays it anyway: it ignores the dead .swf and plays the audio
 *    beside it, which is usually an ordinary MP3. So do we.
 *
 * `getAnnotations()` will not help with case 2 — it models a fixed set of
 * annotation subtypes and RichMedia is not one of them, so the page comes back
 * with an empty list. The low-level PdfDict/PdfArray API reaches it, which is
 * the whole reason this file can exist.
 */
import { PDF, PdfDict, PdfStream, type PdfObject, type PdfRef } from '@libpdf/core';
import { guessAudioMimeType } from './attachments';

/** Which tree a file came from — decides how `readAttachment` reads it back. */
export type AttachmentSource = 'embedded' | 'richmedia';

/** A file found in the document, located but not read. */
export interface AttachmentEntry {
  filename: string;
  /** Bytes as the document declares them, or null when it does not say. */
  size: number | null;
  /** MIME type the document declares, or null — not guessed from the name. */
  mimeType: string | null;
  source: AttachmentSource;
}

/** A name tree deep enough to hit this is malformed or hostile. */
const MAX_NAME_TREE_DEPTH = 32;

/**
 * Follows indirect references.
 *
 * Every typed getter below takes one of these and dereferences automatically,
 * which is what keeps this file free of the "forgot to resolve a PdfRef" bug
 * that the equivalent pdf-lib code has to guard against by hand.
 */
type Resolve = (ref: PdfRef) => PdfObject | null;

const resolverFor = (pdf: PDF): Resolve => (ref) => pdf.context.resolve(ref);

/** Streams have no typed getter — PdfStream extends PdfDict, so narrow by hand. */
function streamAt(dict: PdfDict | undefined, key: string, resolve: Resolve) {
  const value = dict?.get(key, resolve);
  return value instanceof PdfStream ? value : undefined;
}

/**
 * Collects the file specifications out of a name tree.
 *
 * A node holds leaves in /Names — a flat array alternating key, value, key,
 * value — or branches in /Kids, and the spec permits both on the same node, so
 * this reads each independently rather than treating them as alternatives.
 * Only the odd indices of /Names are values; the even ones are lookup keys,
 * which we ignore because the file specification carries a better name.
 */
function collectFileSpecs(
  node: PdfDict | undefined,
  resolve: Resolve,
  found: PdfDict[],
  depth = 0,
): void {
  if (!node || depth > MAX_NAME_TREE_DEPTH) return;

  const names = node.getArray('Names', resolve);
  if (names) {
    for (let index = 1; index < names.length; index += 2) {
      const spec = names.at(index, resolve);
      if (spec instanceof PdfDict) found.push(spec);
    }
  }

  const kids = node.getArray('Kids', resolve);
  if (kids) {
    for (let index = 0; index < kids.length; index += 1) {
      const kid = kids.at(index, resolve);
      if (kid instanceof PdfDict) collectFileSpecs(kid, resolve, found, depth + 1);
    }
  }
}

/**
 * The filename a file specification declares. /UF is the Unicode form and /F
 * the legacy one; Acrobat writes both, so prefer /UF and fall back.
 */
function fileSpecName(spec: PdfDict): string | undefined {
  return (spec.getString('UF') ?? spec.getString('F'))?.asString();
}

/** The stream a file specification points at, if it has one. */
function fileSpecStream(spec: PdfDict, resolve: Resolve): PdfStream | undefined {
  return streamAt(spec.getDict('EF', resolve), 'F', resolve);
}

/**
 * Size and type, read from the stream dictionary rather than the stream.
 *
 * /Params /Size is the decoded length — the real one, and the only one worth
 * showing someone deciding whether to press play.
 *
 * /Length is the *encoded* length, so it stands in for the real size only when
 * the file is stored uncompressed — which for audio and video, already
 * compressed formats, it usually is. When there is a /Filter and no declared
 * /Size, the two disagree and there is no way to reconcile them short of
 * decoding the whole file, which is the one thing this module will not do. A
 * 200 MB attachment compresses to a /Length of 2.4 MB, and showing "2.4 MB"
 * against a file that takes 200 MB to open is worse than showing nothing. So
 * that case reports null, and the UI omits the size rather than inventing one.
 *
 * /Subtype carries the MIME type the author declared, which beats guessing
 * from the extension.
 */
function streamFacts(stream: PdfStream, resolve: Resolve) {
  const declaredSize = stream.getDict('Params', resolve)?.getNumber('Size', resolve);
  const isEncoded = stream.get('Filter', resolve) !== undefined;
  const length = isEncoded ? undefined : stream.getNumber('Length', resolve);

  return {
    size: (declaredSize ?? length)?.value ?? null,
    mimeType: stream.getName('Subtype')?.value ?? null,
  };
}

/** What a walk hands back for one file, before anything decides to keep it. */
interface FoundFile {
  filename: string;
  stream: PdfStream;
  source: AttachmentSource;
  resolve: Resolve;
}

/**
 * Walks both trees, handing every file it finds to `visit`. Stops early if
 * `visit` returns false.
 *
 * Shared by discovery and reading so the two cannot drift: a file listed here
 * is reachable by exactly the same route, under the same name, when somebody
 * asks to play it.
 *
 * ── Why this is hand-written rather than `pdf.getAttachments()` ──
 *
 * The library's own attachment API is a single call and reports description
 * and timestamps for free, which this does not. It was used here until a
 * measurement killed it: asked for a compressed attachment that does not
 * declare /Params /Size, it decodes the entire file to find the size out. For
 * a 200 MB attachment that is 382 MB of memory and 239 ms spent to render a
 * badge — exactly the eagerness this module exists to prevent.
 *
 * Reading the size the document declares, and accepting null when it declares
 * none, costs about sixty lines and makes listing genuinely free at any file
 * size. Nothing displays the description or the dates, so nothing is lost.
 */
function eachFile(pdf: PDF, visit: (file: FoundFile) => boolean): void {
  const resolve = resolverFor(pdf);

  const offer = (spec: PdfDict, source: AttachmentSource): boolean => {
    const filename = fileSpecName(spec);
    const stream = filename ? fileSpecStream(spec, resolve) : undefined;
    if (!filename || !stream) return true;
    return visit({ filename, stream, source, resolve });
  };

  // Case 1 — the catalog's attachment tree.
  const embedded: PdfDict[] = [];
  collectFileSpecs(
    pdf.getCatalog().getDict('Names', resolve)?.getDict('EmbeddedFiles', resolve),
    resolve,
    embedded,
  );
  for (const spec of embedded) {
    if (!offer(spec, 'embedded')) return;
  }

  // Case 2 — RichMedia annotation assets.
  for (const page of pdf.getPages()) {
    const annotations = page.dict.getArray('Annots', resolve);
    if (!annotations) continue;

    for (let index = 0; index < annotations.length; index += 1) {
      const annotation = annotations.at(index, resolve);
      if (!(annotation instanceof PdfDict)) continue;
      if (annotation.getName('Subtype')?.value !== 'RichMedia') continue;

      const assets = annotation.getDict('RichMediaContent', resolve)?.getDict('Assets', resolve);

      const specs: PdfDict[] = [];
      collectFileSpecs(assets, resolve, specs);

      for (const spec of specs) {
        if (!offer(spec, 'richmedia')) return;
      }
    }
  }
}

/**
 * Every embedded file in the document, keyed by filename.
 *
 * Attachments are walked before RichMedia assets, so that if an asset happens
 * to share a name with a real attachment, the attachment is what people get.
 */
export function collectAttachments(pdf: PDF): Map<string, AttachmentEntry> {
  const found = new Map<string, AttachmentEntry>();

  eachFile(pdf, ({ filename, stream, source, resolve }) => {
    // One asset can be referenced from several annotations, and the first
    // claim on a name wins.
    if (found.has(filename)) return true;

    const facts = streamFacts(stream, resolve);

    // The attachment tree is taken whole — an author who attached a .csv meant
    // it to be there. RichMedia assets are filtered to audio: they are a
    // player's internals rather than files anyone chose to attach, and this is
    // what drops the .swf sitting beside the audio, the one asset here a
    // browser can do nothing with.
    //
    // The declared /Subtype decides that when there is one, and the extension
    // only when there is not. Filtering on the declaration alone would drop a
    // perfectly good .mp3 from any tool that omitted it.
    if (source === 'richmedia') {
      const effective = facts.mimeType ?? guessAudioMimeType(filename);
      if (!effective?.startsWith('audio/')) return true;
    }

    found.set(filename, { filename, source, ...facts });
    return true;
  });

  return found;
}

/**
 * Reads one file's bytes, finding it again by name.
 *
 * Looking it up a second time rather than holding the stream from discovery is
 * what keeps discovery cheap — see the note in useAttachments. This is the one
 * place decoding is meant to happen.
 */
export function readAttachment(pdf: PDF, entry: AttachmentEntry): Uint8Array {
  let bytes: Uint8Array | undefined;

  eachFile(pdf, (file) => {
    if (file.filename !== entry.filename || file.source !== entry.source) return true;
    bytes = file.stream.getDecodedData();
    return false;
  });

  if (!bytes) throw new Error(`${entry.filename} is no longer in the document`);
  return bytes;
}
