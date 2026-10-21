import { describe, it, expect } from 'vitest';
import { detectAudioType } from './audioDetection';

/**
 * Tests for deciding whether an embedded file is audio, and which MIME type to
 * play it as. The PDF's declared type wins when it says audio; otherwise the
 * file extension decides.
 */

describe('detectAudioType', () => {
  describe('by file extension', () => {
    it.each([
      ['call.mp3', 'audio/mpeg'],
      ['call.wav', 'audio/wav'],
      ['call.m4a', 'audio/mp4'],
      ['call.aac', 'audio/aac'],
      ['call.ogg', 'audio/ogg'],
    ])('recognises %s as %s', (filename, type) => {
      expect(detectAudioType(filename)).toBe(type);
    });

    it('ignores the extension’s case', () => {
      expect(detectAudioType('CALL.MP3')).toBe('audio/mpeg');
    });

    it('uses only the last extension', () => {
      // Dots elsewhere in the name (dates, versions) must not confuse it
      expect(detectAudioType('call.2024.03.mp3')).toBe('audio/mpeg');
      expect(detectAudioType('call.mp3.pdf')).toBeNull();
    });

    it.each([['report.pdf'], ['notes.txt'], ['image.png']])('returns null for %s', (filename) => {
      expect(detectAudioType(filename)).toBeNull();
    });

    it('returns null for a name with no extension', () => {
      // A file simply called "mp3" has no extension; its name is not one
      expect(detectAudioType('mp3')).toBeNull();
      expect(detectAudioType('recording')).toBeNull();
    });
  });

  describe('with a type declared by the PDF', () => {
    it('uses the declared type when it is audio, whatever the extension says', () => {
      // A recording saved with the wrong or no extension
      expect(detectAudioType('recording.bin', 'audio/x-wav')).toBe('audio/x-wav');
      expect(detectAudioType('recording', 'audio/webm')).toBe('audio/webm');
    });

    it('falls back to the extension when the declared type is not audio', () => {
      // PDFs often declare a generic type for every embedded file
      expect(detectAudioType('call.mp3', 'application/octet-stream')).toBe('audio/mpeg');
    });

    it('does not treat a non-audio file as audio because of its declared type', () => {
      expect(detectAudioType('report.pdf', 'application/pdf')).toBeNull();
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['an empty string', ''],
    ])('falls back to the extension when the declared type is %s', (_label, declared) => {
      expect(detectAudioType('call.mp3', declared)).toBe('audio/mpeg');
    });
  });
});
