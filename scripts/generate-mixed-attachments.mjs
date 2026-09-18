import { PDFDocument, rgb, StandardFonts, AFRelationship } from 'pdf-lib';
import { writeFileSync } from 'fs';

/**
 * A case file carrying attachments that are NOT audio.
 *
 * Every other test document with attachments carries only .mp3 and .wav, which
 * meant the attachment indicator's non-audio branch — a download rather than a
 * player — had never actually rendered in the browser. This document exists to
 * exercise it, and to give the placement comparison one case with mixed
 * content, since a real case file rarely holds audio alone.
 */
const ATTACHMENTS = [
  {
    name: 'interview-transcript.txt',
    description: 'Transcript of the recorded interview',
    mimeType: 'text/plain',
    bytes: Buffer.from(
      [
        'INTERVIEW TRANSCRIPT — CASE-2026-0184',
        'Recorded 14 March 2026, 09:12',
        '',
        'INVESTIGATOR: Thank you for coming in. For the record, please',
        'state your name and role.',
        '',
        'WITNESS: Dana Okafor. I manage the receiving dock on weekends.',
        '',
        'INVESTIGATOR: Walk me through the morning of the 3rd.',
        '',
        'WITNESS: The delivery came in around six. The seal on the third',
        'container was already broken when it came off the truck, so I',
        'flagged it and photographed it before anyone touched it.',
        '',
        'INVESTIGATOR: Did you report it at the time?',
        '',
        'WITNESS: Same morning. The photographs are attached to the',
        'incident form I filed.',
        '',
        '[TRANSCRIPT ENDS]',
        '',
      ].join('\n'),
      'utf8',
    ),
  },
  {
    name: 'evidence-log.csv',
    description: 'Chain-of-custody log for the exhibits',
    mimeType: 'text/csv',
    bytes: Buffer.from(
      [
        'exhibit,description,collected,collected_by,location',
        'A-01,Broken container seal,2026-03-03T06:14,D. Okafor,Dock 3',
        'A-02,Photograph of seal in situ,2026-03-03T06:16,D. Okafor,Dock 3',
        'A-03,Delivery manifest (original),2026-03-03T06:40,R. Villalobos,Office',
        'A-04,Gate camera export 0600-0700,2026-03-04T11:02,S. Nakamura,Security',
        'A-05,Signed incident form,2026-03-03T09:55,D. Okafor,Office',
        '',
      ].join('\n'),
      'utf8',
    ),
  },
];

const PAGE_LINES = [
  'Case Reference: CASE-2026-0184',
  'Opened: 3 March 2026',
  'Status: Under review',
  '',
  'Summary',
  '',
  'A container seal was found broken on arrival at Dock 3 during the',
  'weekend delivery of 3 March 2026. The receiving manager documented',
  'the condition before handling and filed an incident form the same',
  'morning.',
  '',
  'Attached to this file:',
  '',
  '  - interview-transcript.txt   witness interview, 14 March 2026',
  '  - evidence-log.csv           chain-of-custody for exhibits A-01 to A-05',
  '',
  'Neither attachment is audio, so the viewer should offer each one as a',
  'download rather than a player.',
];

async function generate() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([612, 792]);
  let y = 720;

  page.drawText('Incident Case File', {
    x: 50,
    y,
    size: 20,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 40;

  page.drawLine({
    start: { x: 50, y },
    end: { x: 562, y },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 25;

  for (const line of PAGE_LINES) {
    if (line === '') {
      y -= 12;
      continue;
    }
    page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
    y -= 18;
  }

  page.drawText('Page 1 of 1', { x: 270, y: 30, size: 9, font, color: rgb(0.5, 0.5, 0.5) });

  // These land in the catalog's /Names /EmbeddedFiles tree — the attachment
  // model proper, which is what the viewer lists.
  for (const attachment of ATTACHMENTS) {
    await doc.attach(attachment.bytes, attachment.name, {
      mimeType: attachment.mimeType,
      description: attachment.description,
      creationDate: new Date('2026-03-14T09:12:00Z'),
      modificationDate: new Date('2026-03-14T09:12:00Z'),
      afRelationship: AFRelationship.Supplement,
    });
  }

  const bytes = await doc.save();
  writeFileSync('public/case-document-attachments.pdf', bytes);
  console.log(
    `Generated: public/case-document-attachments.pdf (${ATTACHMENTS.length} attachments, ${bytes.length} bytes)`,
  );
}

generate();
