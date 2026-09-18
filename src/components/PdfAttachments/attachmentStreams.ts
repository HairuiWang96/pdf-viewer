/**
 * Locates every embedded file in a document — without reading any of them.
 *
 * This is the discovery half of attachments, and it deliberately stops at the
 * stream object. Walking the object graph is cheap and tells us everything an
 * indicator needs: the filename, the declared size, and that the file is there
 * at all. Decoding is what costs, and it is left to the caller to do per file,
 * on demand. See PdfAttachment for why that split exists.
 *
 * ── The two places a PDF can keep a file ──
 *
 * 1. /Names /EmbeddedFiles on the catalog. The attachment model proper — what
 *    a viewer means by "this document has attachments", and the only thing
 *    pdf.js's getAttachments() looks at.
 *
 * 2. A RichMedia annotation's own /Assets tree. The Flash era: the annotation
 *    names a player .swf and passes it the audio through FlashVars. A file in
 *    here is invisible to getAttachments() — it returns null, and every
 *    indicator correctly shows nothing, because as far as the spec's
 *    attachment model goes the document has no attachments. Acrobat still
 *    plays these: it ignores the dead .swf and plays the audio beside it,
 *    which is usually an ordinary MP3. So do we.
 *
 * pdf-lib rather than pdf.js for both, for two reasons. pdf.js has no
 * RichMedia support at all (it logs "Unimplemented annotation type" and falls
 * back to a base annotation, discarding the content dictionary), so case 2 is
 * unreachable through it. And its getAttachments() decodes every attachment up
 * front, which is exactly the eagerness this module exists to avoid.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';
import { guessAudioMimeType } from './attachments';

/** A file found in the document, located but not read. */
export interface AttachmentStream {
  filename: string;
  /** Bytes as the document declares them, or null when it does not say. */
  size: number | null;
  /** The undecoded stream. Decoding it is the caller's business. */
  stream: PDFRawStream;
}

/** A name tree deep enough to hit this is malformed or hostile. */
const MAX_NAME_TREE_DEPTH = 32;

/**
 * A pdf-lib class used as a value, for `instanceof`. Written in terms of
 * `prototype` rather than a construct signature because pdf-lib keeps its
 * constructors private — the classes are built through static factories — and
 * a private constructor is not assignable to a `new (...)` type.
 */
type PdfObjectClass<T> = Function & { prototype: T };

/**
 * pdf-lib's typed `lookup(key, Type)` throws when the key is missing rather
 * than returning undefined, which would make every optional key below a
 * try/catch. This looks up untyped and narrows instead, so an absent key and a
 * key of the wrong type both come back as undefined.
 */
function lookupAs<T>(
  dict: PDFDict | undefined,
  key: string,
  type: PdfObjectClass<T>,
): T | undefined {
  const value = dict?.lookup(PDFName.of(key));
  // The cast is what the `prototype` form costs: TypeScript narrows on
  // instanceof only for a construct signature, which pdf-lib cannot give us.
  return value instanceof type ? (value as T) : undefined;
}

/**
 * Collects the file specifications out of a name tree.
 *
 * A node holds leaves in /Names — a flat array alternating key, value, key,
 * value — or branches in /Kids, and the spec permits both on the same node, so
 * this reads each independently rather than treating them as alternatives.
 * Only the odd indices of /Names are values; the even ones are the lookup keys,
 * which we ignore because the file specification carries a better name.
 */
function collectFileSpecs(node: PDFDict | undefined, found: PDFDict[], depth = 0): void {
  if (!node || depth > MAX_NAME_TREE_DEPTH) return;

  const names = lookupAs(node, 'Names', PDFArray);
  if (names) {
    for (let index = 1; index < names.size(); index += 2) {
      const spec = names.lookup(index);
      if (spec instanceof PDFDict) found.push(spec);
    }
  }

  const kids = lookupAs(node, 'Kids', PDFArray);
  if (kids) {
    for (let index = 0; index < kids.size(); index += 1) {
      const kid = kids.lookup(index);
      if (kid instanceof PDFDict) collectFileSpecs(kid, found, depth + 1);
    }
  }
}

/**
 * The filename a file specification declares. /UF is the Unicode form and /F
 * the legacy one; Acrobat writes both, so prefer /UF and fall back.
 */
function fileSpecName(spec: PDFDict): string | undefined {
  const name = spec.lookup(PDFName.of('UF')) ?? spec.lookup(PDFName.of('F'));
  return name instanceof PDFHexString || name instanceof PDFString
    ? name.decodeText()
    : undefined;
}

/**
 * The size of a file specification's stream, without touching its bytes.
 *
 * /Params /Size is the real, decoded length and the one worth showing. /Length
 * is the fallback, and only equals it when the stream is stored uncompressed —
 * which for audio and video, already compressed formats, it usually is.
 */
function streamSize(stream: PDFRawStream): number | null {
  const params = lookupAs(stream.dict, 'Params', PDFDict);
  const declared =
    lookupAs(params, 'Size', PDFNumber) ?? lookupAs(stream.dict, 'Length', PDFNumber);
  return declared ? declared.asNumber() : null;
}

/** The stream a file specification points at, if it has one. */
function fileSpecStream(spec: PDFDict): PDFRawStream | undefined {
  return lookupAs(lookupAs(spec, 'EF', PDFDict), 'F', PDFRawStream);
}

/** Case 1 — the catalog's attachment tree. Every file in it counts. */
function collectEmbeddedFiles(document: PDFDocument, found: Map<string, AttachmentStream>): void {
  const tree = lookupAs(lookupAs(document.catalog, 'Names', PDFDict), 'EmbeddedFiles', PDFDict);

  const specs: PDFDict[] = [];
  collectFileSpecs(tree, specs);

  for (const spec of specs) {
    const filename = fileSpecName(spec);
    const stream = filename ? fileSpecStream(spec) : undefined;
    if (!filename || !stream || found.has(filename)) continue;

    found.set(filename, { filename, size: streamSize(stream), stream });
  }
}

/** Case 2 — RichMedia annotation assets. Audio only; see the note below. */
function collectRichMediaAudio(document: PDFDocument, found: Map<string, AttachmentStream>): void {
  for (const page of document.getPages()) {
    const annotations = lookupAs(page.node, 'Annots', PDFArray);
    if (!annotations) continue;

    for (let index = 0; index < annotations.size(); index += 1) {
      const annotation = annotations.lookup(index);
      if (!(annotation instanceof PDFDict)) continue;
      if (annotation.get(PDFName.of('Subtype'))?.toString() !== '/RichMedia') continue;

      const assets = lookupAs(
        lookupAs(annotation, 'RichMediaContent', PDFDict),
        'Assets',
        PDFDict,
      );

      const specs: PDFDict[] = [];
      collectFileSpecs(assets, specs);

      for (const spec of specs) {
        const filename = fileSpecName(spec);
        // Unlike the attachment tree, this one is filtered to audio. These
        // assets are a player's internals rather than files the author meant
        // to attach, and the extension check is what drops the .swf sitting
        // beside the audio — the one asset here a browser can do nothing with.
        if (!filename || !guessAudioMimeType(filename)) continue;
        // One asset can be referenced from several annotations, and a name
        // already claimed by a real attachment wins.
        if (found.has(filename)) continue;

        const stream = fileSpecStream(spec);
        if (!stream) continue;

        found.set(filename, { filename, size: streamSize(stream), stream });
      }
    }
  }
}

/**
 * Every embedded file in the document, keyed by filename.
 *
 * Real attachments first, so that if a RichMedia asset happens to share a name
 * with one, the attachment is what people get.
 */
export function collectAttachmentStreams(document: PDFDocument): Map<string, AttachmentStream> {
  const found = new Map<string, AttachmentStream>();
  collectEmbeddedFiles(document, found);
  collectRichMediaAudio(document, found);
  return found;
}
