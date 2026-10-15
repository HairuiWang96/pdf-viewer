import { PDF, PdfDict, PdfStream } from '@libpdf/core';
import type { PdfObject, PdfRef } from '@libpdf/core';
import { detectAudioType } from './audioDetection';

export interface RichMieaiaAudio {
  name: string;
  filename: string;
  mimeType: string;
  read: () => Uint8Array;
}

// Finds audio files stored inside RichMedia (Flash) annotations. These are not
// in the PDF's normal attachment list, so they are found by walking each page:
//
//   Page
//   └─ /Annots                       the page's annotations
//      └─ annotation, /Subtype /RichMedia
//         └─ /RichMediaContent
//            └─ /Assets              a name tree (see fileSpecs below)
//               └─ file spec         one per embedded file
//                  ├─ /UF or /F      the file's name, e.g. "clip.mp3"
//                  └─ /EF
//                     └─ /F          stream holding the file's bytes
//
// Assets usually hold the Flash player (.swf) plus the audio it plays; only
// the audio is returned.
export function findRichMediaAudio(pdf: PDF): RichMieaiaAudio[] {
  const resolve = (ref: PdfRef): PdfObject | null => pdf.context.resolve(ref);
  const found: RichMieaiaAudio[] = [];

  pdf.getPages().forEach((page, pageIndex) => {
    const annots = page.dict.getArray('Annots', resolve);
    if (!annots) return;

    for (let i = 0; i < annots.length; i++) {
      const annot = annots.at(i, resolve);
      if (!(annot instanceof PdfDict) || annot.getName('Subtype')?.value !== 'RichMedia') continue;

      const assets = annot.getDict('RichMediaContent', resolve)?.getDict('Assets', resolve);

      for (const spec of fileSpecs(assets, resolve)) {
        const filename = (spec.getString('UF') ?? spec.getString('f'))?.asString();
        const stream = spec.getDict('EF', resolve)?.get('F', resolve);
        if (!filename || !(stream instanceof PdfStream)) continue;

        // Skip the Flash Player (.swf) and anything else that is not audio

        const mimeType = detectAudioType(filename, stream.getName('Subtype')?.value);
        if (!mimeType) continue;

        found.push({
          name: `richmedia:${pageIndex + 1}:${i}:${filename}`,
          filename,
          mimeType,
          read: () => stream.getDecodedData(),
        });
      }
    }
  });

  return found;
}

// Collects file specs from a name tree: valuse sit at odd indexes of /Names, children in /Kids
//
//   /Names [ (clip.mp3) <<file spec>>  (player.swf) <<file spec>> ]
//             0          1             2            3    ← values at 1, 3, …
//   /Kids  [ <<node>> <<node>> ]       a big tree splits into child nodes,
//                                      each with its own /Names or /Kids
function fileSpecs(node: PdfDict | undefined, resolve: (ref: PdfRef) => PdfObject | null, depth = 0): PdfDict[] {
  if (!node || depth > 32) return [];
  const result: PdfDict[] = [];

  const names = node.getArray('Names', resolve);
  for (let i = 1; names && i < names.length; i += 2) {
    const spec = names.at(i, resolve);
    if (spec instanceof PdfDict) result.push(spec);
  }

  const kids = node.getArray('Kids', resolve);
  for (let i = 0; kids && i < kids.length; i++) {
    const kid = kids.at(i, resolve);
    if (kid instanceof PdfDict) result.push(...fileSpecs(kid, resolve, depth + 1));
  }

  return result;
}
