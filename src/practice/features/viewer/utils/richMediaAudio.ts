// Proposed, NOT in the other project yet: the filename fallback reads /F, not
// /f. Keys are case-sensitive, so /f never matched and a file spec with only
// /F (older PDFs) was skipped.
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
  // PDF objects often point to each other by number instead of holding each
  // other: `/Annots 15 0 R` means "the annotations are object 15". libpdf
  // calls such a pointer a PdfRef. resolve looks one up in the file's object
  // table (pdf.context) and returns the real object, or null if it is missing.
  //
  // Passed to every get…(key, resolve) below: a value may be the object itself
  // or a reference to it, and the getter follows the reference when it is one.
  //
  // One reference points to exactly one object, so resolve is one in, one out.
  // Many references can share one object (two pages using the same font both
  // say `/Font 30 0 R`). One-to-many is an array of references, e.g.
  // `/Annots [20 0 R 21 0 R]`, followed one at a time: getArray('Annots',
  // resolve) gets the array, then annots.at(i, resolve) gets each annotation.
  const resolve = (ref: PdfRef): PdfObject | null => pdf.context.resolve(ref);
  const found: RichMieaiaAudio[] = [];

  pdf.getPages().forEach((page, pageIndex) => {
    const annots = page.dict.getArray('Annots', resolve);
    // `return`, not `continue`: this is forEach's callback, not a loop, so
    // `continue` would not compile. Returning ends this page's call and forEach
    // moves on to the next page, the same as `continue` would. The real loops
    // below use `continue`; a `return` there would skip the rest of the page.
    if (!annots) return;

    for (let i = 0; i < annots.length; i++) {
      const annot = annots.at(i, resolve);
      if (!(annot instanceof PdfDict) || annot.getName('Subtype')?.value !== 'RichMedia') continue;

      const assets = annot.getDict('RichMediaContent', resolve)?.getDict('Assets', resolve);

      for (const spec of fileSpecs(assets, resolve)) {
        // Keys are case-sensitive: /F, not /f
        const filename = (spec.getString('UF') ?? spec.getString('F'))?.asString();
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
