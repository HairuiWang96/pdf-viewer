/**
 * Locates every embedded file in a document — without reading any of them.
 *
 * This is the discovery half of attachments, and it deliberately stops short
 * of the bytes. Walking the object graph is cheap and tells us everything an
 * indicator needs: the filename, the declared size and type, and that the file
 * is there at all. ‼️Decoding is what costs, and it is left to `readAttachment`
 * to do per file, on demand. See PdfAttachment for why that split exists.
 *
 * ── The two places a PDF can keep a file ──
 *
 * 1. /Names /EmbeddedFiles on the catalog. The attachment model proper — what
 *    a viewer means by "this document has attachments". Walked by hand here
 *    rather than through `pdf.getAttachments()`; see the note on `eachFile`
 *    for the measurement that decided it.
 *
 * 2. A RichMedia annotation's own /Assets tree. The Flash era: the annotation
 *    names a player .swf and passes it the audio through FlashVars. Nothing
 *    treats a file in here as an attachment — by the spec's own model the
 *    document has none — which is why every viewer showed nothing for it.
 *    Acrobat plays it anyway: it ignores the dead .swf and plays the audio
 *    beside it, which is usually an ordinary MP3. So do we.
 *
 * ── What the library does and does not give us ──
 *
 * Worth stating, because it is the opposite of what you would assume:
 * **`@libpdf/core` has no RichMedia support, and nothing audio-related at
 * all.** There is no API to look up, and none is coming — no PDF library
 * models RichMedia, which is the whole reason this file exists.
 *
 * What the library contributes is generic object access: dictionaries,
 * arrays, streams, and reference resolution. It hands over `PdfDict` and
 * `PdfArray` and has no idea what any particular key means.
 *
 * Every key name below — /RichMediaContent, /Assets, /EF, /UF, /Params /Size
 * — comes from the PDF specification instead: ISO 32000 for most of them,
 * Adobe's PDF 1.7 ExtensionLevel 3 for RichMedia itself. The route was
 * confirmed by dumping the objects of a real file and reading them off the
 * output, not from any library documentation. The domain knowledge in this
 * module is ours; only the parsing underneath it is the library's.
 *
 * The consequence is a maintenance one. This walk depends on the low-level
 * API staying shaped as it is, and an upstream release will never improve
 * RichMedia handling because upstream has no concept of it.
 *
 * `getAnnotations()` will not help with case 2 either — it models a fixed set
 * of annotation subtypes and RichMedia is not among them, so the page comes
 * back with an empty list.
 */
import { PDF, PdfDict, PdfStream, type PdfObject, type PdfRef } from '@libpdf/core';
import { guessAudioMimeType } from './attachments';

/** Which tree a file came from — decides how `readAttachment` reads it back. */
export type AttachmentSource = 'embedded' | 'richmedia';

/** A file found in the document, located but not read.‼️ */
export interface AttachmentEntry {
    /**
     * Stable identity: the object number of the stream holding the bytes.
     *
     * Not the filename. A RichMedia annotation owns a *private* asset tree, so
     * two annotations can legitimately carry different files under the same
     * name — a recording called `part-a.mp3` on page 1 and a different one, also
     * called `part-a.mp3`, on page 3. Deduplicating by name silently threw the
     * second away. The object number is what the document itself uses to tell
     * two streams apart, so it is what we use.
     */
    id: string;
    filename: string;
    /** Bytes as the document declares them, or null when it does not say. */
    size: number | null;
    /** MIME type the document declares, or null — not guessed from the name. */
    mimeType: string | null;
    source: AttachmentSource;
    /**
     * 1-based page the annotation sits on, or null for a document-wide
     * attachment, which belongs to the file rather than to any one page.
     * Two files sharing a name are told apart by this in the UI.
     */
    page: number | null;
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

/**
 * Builds a `Resolve` bound to one document.
 *
 * There are two arrow functions on the line below, which is dense enough to be
 * worth taking apart:
 *
 *     const resolverFor = (pdf: PDF): Resolve => (ref) => pdf.context.resolve(ref);
 *           ─────┬─────   ────┬────   ───┬───     ──────────────┬───────────────
 *                │            │         │                      │
 *                │            │         │                      └─ the INNER function
 *                │            │         └─ RETURN TYPE of the outer one
 *                │            └─ the outer function's parameter
 *                └─ a const holding the OUTER function
 *
 * A function that returns a function. Written longhand it is just:
 *
 *     function resolverFor(pdf: PDF): Resolve {
 *       return function (ref: PdfRef): PdfObject | null {
 *         return pdf.context.resolve(ref);
 *       };
 *     }
 *
 * ── Three things that are easy to misread ──
 *
 * 1. `: Resolve` is the *return type of the outer function*, not the type of
 *    `resolverFor`. That is `(pdf: PDF) => Resolve`.
 *
 * 2. ‼️The inner `(ref)` carries no type annotation because it does not need
 *    one: `: Resolve` already describes the function being returned, so
 *    TypeScript infers `ref: PdfRef` from it. ‼️This is contextual typing — the
 *    annotation flows inward. Remove `: Resolve` and `(ref: PdfRef)` has to be
 *    written out by hand.
 *
 * 3. The wrapper is load-bearing, not style. `pdf.context.resolve` reads
 *    `this.registry` internally, so handing the bare method to a caller loses
 *    its receiver and throws on first use:
 *
 *        const bare = pdf.context.resolve;
 *        bare(ref);   // TypeError: Cannot read properties of undefined
 *                     //            (reading 'registry')
 *
 *    Calling it through the arrow keeps it attached to its object.
 *
 * `pdf` is captured in the closure, so every call site downstream is just
 * `resolve(ref)` and nothing has to carry the document around — one
 * `resolverFor(pdf)` at the top of `eachFile`, then `resolve` is threaded
 * through every lookup in the walk.
 */
const resolverFor =
    (pdf: PDF): Resolve =>
    ref =>
        pdf.context.resolve(ref);

/** Streams have no typed getter — PdfStream extends PdfDict, so narrow by hand. */
function streamAt(dict: PdfDict | undefined, key: string, resolve: Resolve) {
    const value = dict?.get(key, resolve);
    return value instanceof PdfStream ? value : undefined;
}

/**
 * Collects the file specifications out of a name tree.
 *
 * A node holds ‼️leaves in /Names — a flat array alternating key, value, key,
 * value — or branches in /Kids, and the spec permits both on the same node, so
 * this reads each independently rather than treating them as alternatives.
 * Only the odd indices of /Names are values; the even ones are lookup keys,
 * which we ignore because the file specification carries a better name.
 */
function collectFileSpecs(node: PdfDict | undefined, resolve: Resolve, found: PdfDict[], depth = 0): void {
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
 * Size and type, read from the stream dictionary rather than the stream.‼️
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
    id: string;
    filename: string;
    stream: PdfStream;
    source: AttachmentSource;
    page: number | null;
    resolve: Resolve;
}

/**
 * The identity of the stream a file specification points at.
 *
 * The object number is the document's own answer to "are these the same
 * file", which is exactly the question `collectAttachments` has to settle. A
 * direct (non-indirect) stream has no object number; that is vanishingly rare
 * for an embedded file, but falling back to a composite key keeps such a file
 * listed rather than dropping it.
 */
function fileSpecId(spec: PdfDict, resolve: Resolve, source: AttachmentSource, page: number | null): string {
    const ref = spec.getDict('EF', resolve)?.getRef('F');
    return ref ? `obj:${ref.objectNumber}:${ref.generation}` : `${source}:${page}:${fileSpecName(spec)}`;
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

    const offer = (spec: PdfDict, source: AttachmentSource, page: number | null): boolean => {
        const filename = fileSpecName(spec);
        const stream = filename ? fileSpecStream(spec, resolve) : undefined;
        if (!filename || !stream) return true;

        const id = fileSpecId(spec, resolve, source, page);
        return visit({ id, filename, stream, source, page, resolve });
    };

    // Case 1 — the catalog's attachment tree. These belong to the document
    // rather than to any one page, hence the null.
    const embedded: PdfDict[] = [];
    collectFileSpecs(pdf.getCatalog().getDict('Names', resolve)?.getDict('EmbeddedFiles', resolve), resolve, embedded);
    for (const spec of embedded) {
        if (!offer(spec, 'embedded', null)) return;
    }

    // Case 2 — RichMedia annotation assets. Every page, every annotation on it,
    // every asset in that annotation's tree: a document can carry audio on many
    // pages, several annotations on one page, and several files in one
    // annotation, and all three nest rather than compete.
    const pages = pdf.getPages();
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const annotations = pages[pageIndex].dict.getArray('Annots', resolve);
        if (!annotations) continue;

        for (let index = 0; index < annotations.length; index += 1) {
            const annotation = annotations.at(index, resolve);
            if (!(annotation instanceof PdfDict)) continue;
            if (annotation.getName('Subtype')?.value !== 'RichMedia') continue;

            const assets = annotation.getDict('RichMediaContent', resolve)?.getDict('Assets', resolve);

            const specs: PdfDict[] = [];
            collectFileSpecs(assets, resolve, specs);

            for (const spec of specs) {
                if (!offer(spec, 'richmedia', pageIndex + 1)) return;
            }
        }
    }
}

/**
 * Every embedded file in the document, in the order it was found.
 *
 * Attachments come before RichMedia assets, so that when a page's asset and a
 * real attachment point at the same stream, it is listed as the attachment.
 */
export function collectAttachments(pdf: PDF): AttachmentEntry[] {
    const found: AttachmentEntry[] = [];
    const seen = new Set<string>();

    eachFile(pdf, ({ id, filename, stream, source, page, resolve }) => {
        // Deduplicated by stream object, not by name. One asset genuinely can be
        // referenced from several annotations — the same file, listed once — while
        // two annotations holding different files under one name are two files.
        if (seen.has(id)) return true;

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

        seen.add(id);
        found.push({ id, filename, source, page, ...facts });
        return true;
    });

    return found;
}

/**
 * Reads one file's bytes, finding it again by its stream object.
 *
 * Matching on `id` rather than on the filename is what makes this correct for
 * a document carrying two different files under one name: the name would find
 * whichever came first and play the wrong recording.
 *
 * Looking it up a second time rather than holding the stream from discovery is
 * what keeps discovery cheap — see the note in useAttachments. This is the one
 * place decoding is meant to happen.
 */
export function readAttachment(pdf: PDF, entry: AttachmentEntry): Uint8Array {
    let bytes: Uint8Array | undefined;

    eachFile(pdf, file => {
        if (file.id !== entry.id) return true;
        bytes = file.stream.getDecodedData();
        return false;
    });

    if (!bytes) throw new Error(`${entry.filename} is no longer in the document`);
    return bytes;
}
