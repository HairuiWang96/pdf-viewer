import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';
import { PDF } from '@libpdf/core';
import { findRichMediaAudio } from './richMediaAudio';

// The PDFs are built with pdf-lib and read back with libpdf, so each test
// states the exact file spec it is about.

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]); // "ID3"

// Which name keys the file spec has: /UF (Unicode name), /F (older name), or both
interface Spec {
  uf?: string;
  f?: string;
}

// A one-page PDF with a RichMedia annotation holding one MP3 asset
async function withRichMediaAsset(spec: Spec): Promise<PDF> {
  const document = await PDFDocument.create();
  const page = document.addPage();
  const context = document.context;

  const fileSpec = context.obj({ Type: 'Filespec', EF: context.obj({ F: context.register(context.stream(MP3)) }) });
  if (spec.f !== undefined) fileSpec.set(PDFName.of('F'), PDFString.of(spec.f));
  if (spec.uf !== undefined) fileSpec.set(PDFName.of('UF'), PDFHexString.fromText(spec.uf));

  const assets = context.obj({ Names: [PDFHexString.fromText('asset'), context.register(fileSpec)] });
  const annotation = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'RichMedia',
      Rect: [0, 0, 100, 100],
      RichMediaContent: context.obj({ Assets: assets }),
    }),
  );
  page.node.set(PDFName.of('Annots'), context.obj([annotation]));

  return PDF.load(await document.save());
}

const filenames = (pdf: PDF) => findRichMediaAudio(pdf).map((a) => a.filename);

describe('findRichMediaAudio', () => {
  it('names the file from /UF when it has one', async () => {
    expect(filenames(await withRichMediaAsset({ uf: 'clip.mp3', f: 'old-name.mp3' }))).toEqual(['clip.mp3']);
  });

  it('falls back to /F when there is no /UF, as in older PDFs', async () => {
    expect(filenames(await withRichMediaAsset({ f: 'clip.mp3' }))).toEqual(['clip.mp3']);
  });

  it('skips a file spec with no name at all', async () => {
    expect(filenames(await withRichMediaAsset({}))).toEqual([]);
  });

  it('reads the bytes only when read is called', async () => {
    const [audio] = findRichMediaAudio(await withRichMediaAsset({ uf: 'clip.mp3' }));
    expect(audio.read()).toEqual(MP3);
  });
});
