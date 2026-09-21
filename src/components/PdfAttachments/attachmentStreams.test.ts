import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  type PDFContext,
  type PDFObject,
} from 'pdf-lib';
import { PDF } from '@libpdf/core';
import { collectAttachments, readAttachment } from './attachmentStreams';

/**
 * Finding the files a document carries, from both places one can hide them:
 * the catalog's attachment tree, and a RichMedia annotation's private assets.
 *
 * The documents here are built rather than loaded from public/, so each test
 * states the exact structure it is about. The real-world shape this was
 * written against is the one Acrobat produces for embedded audio: one
 * annotation whose asset tree holds an MP3 next to the AudioPlayer.swf that
 * used to play it.
 */

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]); // "ID3"
const SWF = new Uint8Array([0x46, 0x57, 0x53, 0x09]); // "FWS"

interface Asset {
  name: string;
  bytes: Uint8Array;
  /** Written as /Params /Size, the decoded length a real file specifies. */
  declaredSize?: number;
  /** Written as /Subtype — the MIME type the author declares for the file. */
  mimeType?: string;
  /** Stored with a /Filter, so the encoded and decoded lengths differ. */
  compressed?: boolean;
}

/** One file specification with its bytes attached, registered and referenced. */
function fileSpec(context: PDFContext, asset: Asset) {
  const stream = asset.compressed
    ? context.flateStream(asset.bytes)
    : context.stream(asset.bytes);
  if (asset.declaredSize !== undefined) {
    stream.dict.set(PDFName.of('Params'), context.obj({ Size: asset.declaredSize }));
  }
  if (asset.mimeType !== undefined) {
    // A PDF name, not a string — and "/" has to be escaped as "#2F" inside one,
    // which is how "audio/mpeg" is actually stored.
    stream.dict.set(PDFName.of('Subtype'), PDFName.of(asset.mimeType));
  }

  return context.register(
    context.obj({
      Type: 'Filespec',
      F: PDFString.of(asset.name),
      UF: PDFHexString.fromText(asset.name),
      EF: context.obj({ F: context.register(stream) }),
    }),
  );
}

/**
 * A name tree over the given assets.
 *
 * `nest` puts them one /Kids level down instead of directly in /Names, which
 * is the branching form — legal, and what a tree grows into past a handful of
 * entries.
 */
function nameTree(context: PDFContext, assets: Asset[], nest: boolean) {
  const names: PDFObject[] = [];
  for (const asset of assets) {
    names.push(PDFHexString.fromText(asset.name), fileSpec(context, asset));
  }

  const leaf = context.obj({ Names: names });
  return nest ? context.obj({ Kids: context.obj([context.register(leaf)]) }) : leaf;
}

/**
 * Saves a built document and reopens it with the library under test.
 *
 * The fixtures are built with pdf-lib and read with @libpdf/core, which is
 * deliberate on this branch: it means the reader is never checked against its
 * own writer, and a disagreement between the two shows up as a failing test
 * rather than as a file neither of them questions.
 *
 * Saving also matters on its own. A hand-built document is not quite a parsed
 * one — /Length, for instance, is only computed when the file is written — so
 * parsing what we saved is what makes these tests see the shape the hook sees
 * in the browser.
 */
async function reparse(document: PDFDocument): Promise<PDF> {
  return PDF.load(await document.save());
}

/** A document whose assets sit in the catalog's attachment tree. */
async function withEmbeddedFiles(assets: Asset[], { nest = false } = {}): Promise<PDF> {
  const document = await PDFDocument.create();
  document.addPage();

  const tree = nameTree(document.context, assets, nest);
  document.catalog.set(PDFName.of('Names'), document.context.obj({ EmbeddedFiles: tree }));
  return reparse(document);
}

/** A document whose assets sit inside a RichMedia annotation instead. */
async function withRichMedia(assets: Asset[], { nest = false } = {}): Promise<PDF> {
  const document = await PDFDocument.create();
  const page = document.addPage();
  const context = document.context;

  const content = context.register(
    context.obj({ Subtype: 'Sound', Assets: nameTree(context, assets, nest) }),
  );
  const annotation = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'RichMedia',
      Rect: context.obj([0, 0, 100, 100]),
      RichMediaContent: content,
    }),
  );

  page.node.set(PDFName.of('Annots'), context.obj([annotation]));
  return reparse(document);
}

const names = (pdf: PDF) => collectAttachments(pdf).map((a) => a.filename);

describe('collectAttachments', () => {
  describe('the catalog attachment tree', () => {
    it('finds an embedded file', async () => {
      expect(names(await withEmbeddedFiles([{ name: 'clip.mp3', bytes: MP3 }]))).toEqual([
        'clip.mp3',
      ]);
    });

    it('keeps non-audio files, which become downloads rather than players', async () => {
      const found = names(
        await withEmbeddedFiles([
          { name: 'clip.mp3', bytes: MP3 },
          { name: 'transcript.pdf', bytes: MP3 },
        ]),
      );

      expect(found).toEqual(['clip.mp3', 'transcript.pdf']);
    });

    it('reads a branching name tree, not just a flat one', async () => {
      const document = await withEmbeddedFiles([{ name: 'clip.mp3', bytes: MP3 }], { nest: true });

      expect(names(document)).toEqual(['clip.mp3']);
    });

    it('ignores a file specification carrying no bytes', async () => {
      // A name tree entry can point at a Filespec with no /EF — nothing to
      // play, and listing it would offer a control that cannot work.
      const document = await PDFDocument.create();
      document.addPage();
      const context = document.context;

      const spec = context.register(context.obj({ Type: 'Filespec', F: PDFString.of('clip.mp3') }));
      document.catalog.set(
        PDFName.of('Names'),
        context.obj({
          EmbeddedFiles: context.obj({
            Names: context.obj([PDFHexString.fromText('clip.mp3'), spec]),
          }),
        }),
      );

      expect(names(await reparse(document))).toEqual([]);
    });
  });

  describe('RichMedia annotation assets', () => {
    it('finds audio that is not an attachment in the /EmbeddedFiles sense', async () => {
      expect(names(await withRichMedia([{ name: 'clip.mp3', bytes: MP3 }]))).toEqual(['clip.mp3']);
    });

    it('leaves the Flash player behind', async () => {
      // The whole point: the .swf sits in the same asset tree as the audio and
      // is the one thing there a browser can do nothing with.
      const document = await withRichMedia([
        { name: '2017-1506.mp3', bytes: MP3 },
        { name: 'AudioPlayer.swf', bytes: SWF },
      ]);

      expect(names(document)).toEqual(['2017-1506.mp3']);
    });

    it('reads a branching name tree, not just a flat one', async () => {
      const document = await withRichMedia([{ name: 'clip.mp3', bytes: MP3 }], { nest: true });

      expect(names(document)).toEqual(['clip.mp3']);
    });

    it('ignores annotations that are not RichMedia', async () => {
      const document = await PDFDocument.create();
      const page = document.addPage();
      const context = document.context;

      const annotation = context.register(
        context.obj({ Type: 'Annot', Subtype: 'Widget', Rect: context.obj([0, 0, 10, 10]) }),
      );
      page.node.set(PDFName.of('Annots'), context.obj([annotation]));

      expect(names(await reparse(document))).toEqual([]);
    });
  });

  it('returns nothing for a document carrying no files at all', async () => {
    const document = await PDFDocument.create();
    document.addPage();

    expect(names(await reparse(document))).toEqual([]);
  });

  describe('what it reports per file', () => {
    it('prefers the declared decoded size over the raw stream length', async () => {
      // /Length is the encoded length; /Params /Size is the real one, and the
      // only one worth showing someone deciding whether to press play.
      const document = await withEmbeddedFiles([
        { name: 'clip.mp3', bytes: MP3, declaredSize: 8_257_667 },
      ]);

      expect(collectAttachments(document).find((a) => a.filename === 'clip.mp3')?.size).toBe(8_257_667);
    });

    it('falls back to the stream length when the file is stored uncompressed', async () => {
      // With no /Filter, the encoded and decoded lengths are the same number,
      // so /Length is the real size. This is the common case for audio.
      const document = await withEmbeddedFiles([{ name: 'clip.mp3', bytes: MP3 }]);

      expect(collectAttachments(document).find((a) => a.filename === 'clip.mp3')?.size).toBe(MP3.length);
    });

    it('reports no size at all rather than a compressed one', async () => {
      // A compressed file that declares no /Params /Size cannot be sized
      // without decoding it, which is the one thing discovery will not do.
      // /Length here is the *compressed* length — a 200 MB attachment reports
      // 2.4 MB — so claiming it would be worse than admitting we do not know.
      const document = await withEmbeddedFiles([
        { name: 'clip.mp3', bytes: MP3, compressed: true },
      ]);

      expect(collectAttachments(document).find((a) => a.filename === 'clip.mp3')?.size).toBeNull();
    });

    it('still reports a compressed file’s size when the document declares it', async () => {
      const document = await withEmbeddedFiles([
        { name: 'clip.mp3', bytes: MP3, compressed: true, declaredSize: 8_257_667 },
      ]);

      expect(collectAttachments(document).find((a) => a.filename === 'clip.mp3')?.size).toBe(8_257_667);
    });

    it('describes a file without reading it, and reads it only when asked', async () => {
      // The contract this module exists for: discovery locates files and
      // reports what they are, and the caller decides which is worth decoding.
      const document = await withEmbeddedFiles([{ name: 'clip.mp3', bytes: MP3 }]);
      const found = collectAttachments(document).find((a) => a.filename === 'clip.mp3');

      expect(found).toEqual({
        // The document's own object number for the stream — the identity two
        // files sharing a name are told apart by.
        id: expect.stringMatching(/^obj:\d+:\d+$/),
        page: null,
        filename: 'clip.mp3',
        size: MP3.length,
        // Null, not "audio/mpeg": this fixture declares no /Subtype, and
        // discovery reports what the document says rather than inferring from
        // the name. Guessing from the extension is useAttachments' job.
        mimeType: null,
        source: 'embedded',
      });
      expect(readAttachment(document, found!)).toEqual(MP3);
    });

    it('reports the MIME type the document declares, rather than guessing', async () => {
      // The extension says nothing useful here; /Subtype does. Reading the
      // declaration is what the pdf-lib version could not do.
      const document = await withEmbeddedFiles([
        { name: 'recording.bin', bytes: MP3, mimeType: 'audio/mpeg' },
      ]);

      expect(collectAttachments(document).find((a) => a.filename === 'recording.bin')?.mimeType).toBe('audio/mpeg');
    });
  });

  describe('two files, one name', () => {
    /**
     * The case that made identity stop being the filename.
     *
     * A RichMedia annotation owns a *private* asset tree, so nothing stops two
     * annotations carrying different recordings both called `part-a.mp3`.
     * Deduplicating by name listed the first and silently dropped the second —
     * a document where one of the recordings simply could not be reached.
     */
    it('keeps both when different pages use the same filename', async () => {
      const document = await PDFDocument.create();
      const context = document.context;

      for (const bytes of [MP3, SWF]) {
        const page = document.addPage();
        const content = context.register(
          context.obj({
            Assets: nameTree(context, [{ name: 'part-a.mp3', bytes, mimeType: 'audio/mpeg' }], false),
          }),
        );
        page.node.set(
          PDFName.of('Annots'),
          context.obj([
            context.register(
              context.obj({ Type: 'Annot', Subtype: 'RichMedia', RichMediaContent: content }),
            ),
          ]),
        );
      }

      const reopened = await reparse(document);
      const found = collectAttachments(reopened);

      expect(found).toHaveLength(2);
      expect(found.map((a) => a.filename)).toEqual(['part-a.mp3', 'part-a.mp3']);
      // Told apart by the page they sit on, which is what the UI shows.
      expect(found.map((a) => a.page)).toEqual([1, 2]);
      // And by identity, which is what reading uses.
      expect(found[0].id).not.toBe(found[1].id);
      expect(readAttachment(reopened, found[0])).toEqual(MP3);
      expect(readAttachment(reopened, found[1])).toEqual(SWF);
    });

    it('lists one entry when two annotations share the same stream', async () => {
      // The opposite case, and why deduplication exists at all: one asset
      // referenced twice is one file, not two.
      const document = await PDFDocument.create();
      const context = document.context;
      const shared = nameTree(context, [{ name: 'shared.mp3', bytes: MP3, mimeType: 'audio/mpeg' }], false);
      const content = context.register(context.obj({ Assets: shared }));

      for (let i = 0; i < 2; i += 1) {
        const page = document.addPage();
        page.node.set(
          PDFName.of('Annots'),
          context.obj([
            context.register(
              context.obj({ Type: 'Annot', Subtype: 'RichMedia', RichMediaContent: content }),
            ),
          ]),
        );
      }

      expect(collectAttachments(await reparse(document))).toHaveLength(1);
    });
  });

  it('records no page for a document-wide attachment', async () => {
    // An /EmbeddedFiles attachment belongs to the file, not to a page, so
    // there is no page number to show and the label omits it.
    const document = await withEmbeddedFiles([{ name: 'clip.mp3', bytes: MP3 }]);

    expect(collectAttachments(document)[0].page).toBeNull();
  });

  it('records the page a RichMedia asset sits on', async () => {
    const document = await withRichMedia([{ name: 'clip.mp3', bytes: MP3 }]);

    expect(collectAttachments(document)[0].page).toBe(1);
  });
});
