import { describe, it, expect } from 'vitest';
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  decodePDFRawStream,
  type PDFContext,
  type PDFObject,
} from 'pdf-lib';
import { collectAttachmentStreams } from './attachmentStreams';

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
}

/** One file specification with its bytes attached, registered and referenced. */
function fileSpec(context: PDFContext, asset: Asset) {
  const stream = context.stream(asset.bytes);
  if (asset.declaredSize !== undefined) {
    stream.dict.set(PDFName.of('Params'), context.obj({ Size: asset.declaredSize }));
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
 * Round-trips a built document through save and parse.
 *
 * Everything here is written by hand, and a hand-built pdf-lib document is not
 * quite a parsed one — /Length, for instance, is only computed when the file
 * is written. Parsing what we saved means these tests see the same shape the
 * hook sees in the browser rather than a convenient in-memory approximation.
 */
async function reparse(document: PDFDocument) {
  return PDFDocument.load(await document.save(), { throwOnInvalidObject: false });
}

/** A document whose assets sit in the catalog's attachment tree. */
async function withEmbeddedFiles(assets: Asset[], { nest = false } = {}) {
  const document = await PDFDocument.create();
  document.addPage();

  const tree = nameTree(document.context, assets, nest);
  document.catalog.set(PDFName.of('Names'), document.context.obj({ EmbeddedFiles: tree }));
  return reparse(document);
}

/** A document whose assets sit inside a RichMedia annotation instead. */
async function withRichMedia(assets: Asset[], { nest = false } = {}) {
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

const names = (document: PDFDocument) => [...collectAttachmentStreams(document).keys()];

describe('collectAttachmentStreams', () => {
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

      expect(names(document)).toEqual([]);
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

      expect(names(document)).toEqual([]);
    });
  });

  it('returns nothing for a document carrying no files at all', async () => {
    const document = await PDFDocument.create();
    document.addPage();

    expect(names(document)).toEqual([]);
  });

  describe('what it reports per file', () => {
    it('prefers the declared decoded size over the raw stream length', async () => {
      // /Length is the encoded length; /Params /Size is the real one, and the
      // only one worth showing someone deciding whether to press play.
      const document = await withEmbeddedFiles([
        { name: 'clip.mp3', bytes: MP3, declaredSize: 8_257_667 },
      ]);

      expect(collectAttachmentStreams(document).get('clip.mp3')?.size).toBe(8_257_667);
    });

    it('falls back to the stream length when no size is declared', async () => {
      const document = await withEmbeddedFiles([{ name: 'clip.mp3', bytes: MP3 }]);

      expect(collectAttachmentStreams(document).get('clip.mp3')?.size).toBe(MP3.length);
    });

    it('hands back the stream undecoded, so listing costs nothing', async () => {
      // The contract this module exists for: discovery locates files, and the
      // caller decides which of them is worth decoding.
      const document = await withEmbeddedFiles([{ name: 'clip.mp3', bytes: MP3 }]);
      const found = collectAttachmentStreams(document).get('clip.mp3');

      expect(found).toBeDefined();
      expect(decodePDFRawStream(found!.stream).decode()).toEqual(MP3);
    });
  });

  it('lets a real attachment win a name a RichMedia asset also uses', async () => {
    const document = await withEmbeddedFiles([{ name: 'clip.mp3', bytes: MP3 }]);
    const context = document.context;

    const content = context.register(
      context.obj({ Assets: nameTree(context, [{ name: 'clip.mp3', bytes: SWF }], false) }),
    );
    const annotation = context.register(
      context.obj({ Type: 'Annot', Subtype: 'RichMedia', RichMediaContent: content }),
    );
    document.getPages()[0].node.set(PDFName.of('Annots'), context.obj([annotation]));

    const found = collectAttachmentStreams(document);
    expect(found.size).toBe(1);
    expect(decodePDFRawStream(found.get('clip.mp3')!.stream).decode()).toEqual(MP3);
  });
});
