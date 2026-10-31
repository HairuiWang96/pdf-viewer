// Audio unpack demo. Times how long unpacking each audio file in a PDF takes,
// with the same code the viewer uses (the practice folder's
// extractAttachments), and measures how long the page is frozen meanwhile.
import { PDF } from '@libpdf/core';
import { extractAttachments } from '../../src/practice/features/viewer/utils/extractAttachments';
import { detectAudioType } from '../../src/practice/features/viewer/utils/audioDetection';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ── Is the page alive? ──
// A counter and a bar moved from JavaScript on every frame. A CSS animation
// would not do: the browser can keep those moving on another thread even
// while the page's own code is busy, which would hide the freeze.
let frames = 0;
let lastFrame = performance.now();
let longestGap = 0; // reset before each unpack
function tick() {
  // The clock, not the time requestAnimationFrame passes in: Chrome stamps
  // the first frame after a freeze with the time it was due (before the
  // freeze), which would hide the gap
  const now = performance.now();
  frames += 1;
  longestGap = Math.max(longestGap, now - lastFrame);
  lastFrame = now;
  el('frames').textContent = String(frames);
  el('bar').style.transform = `translateX(${(frames * 3) % 300}px)`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

let clicks = 0;
el('click-me').addEventListener('click', () => {
  clicks += 1;
  el('clicks').textContent = String(clicks);
});

// ── Helpers ──
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const setStatus = (text: string) => (el('status').textContent = text);

// Waits until the browser has drawn a frame, so a status message is on
// screen before the page freezes
const afterNextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function addRow(pdf: string, file: string, size: number, unpackMs: number, freezeMs: number) {
  const row = document.createElement('tr');
  const frozen = freezeMs > 100 ? ' class="n frozen"' : ' class="n"';
  row.innerHTML = `<td></td><td></td><td class="n">${mb(size)}</td>
    <td class="n">${Math.round(unpackMs)} ms</td><td${frozen}>${Math.round(freezeMs)} ms</td>`;
  // Names as text, not HTML: a PDF's file names come from outside
  row.children[0].textContent = pdf;
  row.children[1].textContent = file;
  el('results').prepend(row);
}

// ── The unpack ──
async function unpackAll(label: string, bytes: Uint8Array) {
  setStatus(`Listing the attachments in ${label}…`);
  await afterNextFrame();
  const { list, readers } = await extractAttachments(bytes);
  const audio = list.filter((a) => detectAudioType(a.filename, a.mimeType));
  if (audio.length === 0) {
    setStatus(`${label} has no audio attachments.`);
    return;
  }

  for (const a of audio) {
    const read = readers.get(a.name);
    if (!read) continue;
    setStatus(`Unpacking ${a.filename}… watch the counter, or click "Click me" now`);
    // A moment to start clicking before the freeze begins
    await wait(800);
    await afterNextFrame();

    longestGap = 0;
    const start = performance.now();
    const data = read(); // synchronous: the page is frozen until it returns
    const unpackMs = performance.now() - start;
    await afterNextFrame(); // the first frame after the freeze ends the gap

    addRow(label, a.filename, data?.length ?? 0, unpackMs, longestGap);
  }
  setStatus(`Done: ${label}`);
}

async function fetchPdf(name: string) {
  return new Uint8Array(await (await fetch(`/${name}`)).arrayBuffer());
}

// ── The browser's audio player, three ways ──
// 1 has no source at all, so it is left alone.
// 2: a silent WAV one sample long, the placeholder AttachmentIndicatorWithPlaceholder uses
el<HTMLAudioElement>('placeholder-player').src =
  'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';
// 3: a small real recording, unpacked from a test PDF (a few ms)
void (async () => {
  const { list, readers } = await extractAttachments(await fetchPdf('case-audio-attachment.pdf'));
  const first = list.find((a) => detectAudioType(a.filename, a.mimeType));
  const bytes = first && readers.get(first.name)?.();
  if (!first || !bytes) return;
  const type = detectAudioType(first.filename, first.mimeType)!;
  el<HTMLAudioElement>('real-player').src = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type }),
  );
})();

// ── The controls ──
const SAMPLES = [
  'case-audio-attachment.pdf',
  'case-multi-audio.pdf',
  'case-embedded-audio-media.pdf',
  'case-audio-attachment-large.pdf',
];
for (const name of SAMPLES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = name;
  button.addEventListener('click', async () => unpackAll(name, await fetchPdf(name)));
  el('samples').append(button);
}

el<HTMLInputElement>('pick').addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) await unpackAll(file.name, new Uint8Array(await file.arrayBuffer()));
});

let bigPdf: Uint8Array | null = null;
el('build-big').addEventListener('click', async () => {
  if (!bigPdf) {
    setStatus('Building a ~150 MB test PDF (the page freezes while it builds)…');
    await afterNextFrame();
    const source = await extractAttachments(await fetchPdf('case-audio-attachment-large.pdf'));
    const mp3 = source.readers.get(source.list[0].name)?.();
    if (!mp3) return setStatus('Could not read the 30 MB test PDF’s audio.');
    const repeated = new Uint8Array(mp3.length * 5);
    for (let i = 0; i < 5; i++) repeated.set(mp3, i * mp3.length);
    // A small PDF with its own attachment swapped for the long recording
    const pdf = await PDF.load(await fetchPdf('case-audio-attachment.pdf'));
    for (const name of pdf.getAttachments().keys()) pdf.removeAttachment(name);
    pdf.addAttachment('long-hearing.mp3', repeated, { mimeType: 'audio/mpeg' });
    bigPdf = await pdf.save();
  }
  await unpackAll(`built test PDF (${mb(bigPdf.length)})`, bigPdf);
});
