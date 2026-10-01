<!--
DRAFT — ticket comment for the case stamp + audio attachments spike.
Paste the body below into the ticket. The long-form evidence lives in
CASE-STAMP.md and ATTACHMENT-EXTRACTION.md.
-->

## Spike outcome — case stamp with audio attachments

**Summary: the stamp works correctly on documents with audio attachments, and the
radio button turns it on and off correctly in every case tested. Audio attachments
come through stamping unchanged and still play. The one real cost is memory: a very
large recording makes stamping briefly use about 1 GB in the browser.**

---

### AC1 — impact of audio attachments on the case stamp

**What the stamp does.** "With stamp" draws a header bar (case number, title, filed
date, page ID, page number) into the PDF itself, in the browser, and saves a new copy
of the file. That copy includes everything in the original, attachments included.

**Attachments are not affected.** Every audio attachment comes out of stamping
byte-for-byte identical, and still lists and plays in the viewer:

| Test case | Audio | Attachments after stamping | Plays after stamping |
|---|---|---|---|
| CASE-TEST-AUDIO | 1 WAV | Identical | Yes |
| CASE-TEST-AUDIO-MP3 | 1 MP3 | Identical | Yes |
| CASE-TEST-AUDIO-MULTI | 3 files | All 3 identical | Yes |
| CASE-TEST-AUDIO-RICHMEDIA | 1 MP3 in a media player annotation | Identical¹ | Yes |
| CASE-TEST-LINEARIZED | 4 files | All 4 identical | Yes |
| CASE-TEST-AUDIO-LARGE | 28 MB recording | Identical | Yes |
| 5-hour test file² | 5-hour, 123 MB recording | Identical | Yes |

¹ Confirmed in the earlier file-level check (CASE-STAMP.md); the browser check
confirmed it still lists and plays.
² Built to match a real case file: 1 page with a 5-hour, 56 kbps recording. Not in the
test case list.

**Speed is not a problem.** Stamping copies the audio without decoding it, so file size
barely matters:

| File | Time for the stamp to appear | Longest page freeze |
|---|---|---|
| Small audio files (under 1 MB) | 0.1 s | Not noticeable |
| 28 MB recording | 0.2 s | Not noticeable |
| 123 MB, 5-hour recording | 0.35–0.49 s | 50 ms |

**Memory is the real cost.** While stamping the 123 MB file, the browser's memory rose by
about 1 GB (+920 MB and +1,020 MB in two runs), because the original, the stamped copy
and the viewer's own copy all exist at once. That is fine on a desktop, but could crash
the tab on a phone. Not yet tested on a real device.

**Side effects of stamping that are not audio-specific**, found in the same research:

- **Digital signatures break.** Stamping rewrites the file, so a signed PDF shows as
  invalid in a signature checker afterwards.
- **Fast loading is lost.** A "linearised" PDF (one arranged so page 1 can show
  before the whole file arrives) is no longer linearised after stamping. The browser
  cannot restore it.

---

### AC2 — the radio button enables and disables the stamp correctly

**Verified on all six audio test cases, plus the 5-hour file.** Each was checked in the
real app, in Chromium, by clicking the radio buttons and checking the result each time:

| Check | Result |
|---|---|
| Stamp is off by default when a case is picked | ✅ All cases |
| "With stamp" adds the stamp to the page | ✅ All cases |
| "Without stamp" removes it again | ✅ All cases |
| Attachment count stays the same in both states | ✅ All cases |
| Audio plays in both states | ✅ All cases |
| "Download PDF" gives the stamped file when on, the original when off | ✅ All cases |
| The stamped download contains the stamp and identical audio | ✅ All cases |
| Clicking on → off → on quickly settles correctly | ✅ All cases |

The toggle logic also has 12 automated tests (`usePdfStamp.test.ts`): default off with
several cases, default on with a single case, the choice resetting when the case
changes, and the stamped copy being released from memory when the stamp is switched
off, the case changes or the page closes.

**One finding about the radio button itself.** It sits under a heading that says
**"Download"**, but it changes more than the download. It switches the whole page to
the stamped copy: the viewer, the thumbnails, the attachment list and the download.
This works correctly, but the heading suggests it only affects the downloaded file.

---

### Follow-up actions

1. **Move stamping to the server, together with the audio split already proposed.**
   The server would stamp the PDF, take the audio out and serve it separately, and
   re-linearise the PDF. That removes the 1 GB memory spike from the browser, keeps
   fast loading, and makes the PDF itself small. (ATTACHMENT-EXTRACTION.md, §13.)
2. **Test a large audio file on real phones** (iOS Safari, Android Chrome) with the stamp
   switched on, to find out whether the memory spike crashes the tab. Until then, the
   risk is unknown.
3. **Decide what the radio button should control.** Either keep it switching the whole
   view and rename the heading (for example "Case stamp"), or make it affect only the
   download, as the current heading suggests. This is a product decision.
4. **Decide how to handle signed documents.** Stamping makes a valid signature show as
   broken. Options: don't allow stamping on signed files, warn the user, or stamp on the
   server in a way that keeps the original signature verifiable. This needs a product
   or legal decision.

---

### How this was tested

- **In the real app**, in headless Chromium on a Mac, driven by Playwright: pick the
  case, click the radio buttons, check the page text, the attachment list, playback and
  the downloaded file.
- **Attachment bytes** were compared between the original and the stamped download with
  the repo's `compare-pdfs` script, which hashes every attachment.
- **The 5-hour file** was generated to match a real case file's shape (1 page, 5-hour
  recording at 56 kbps). No real case data was used.
- **Not tested:** Safari, Firefox, real phones.
