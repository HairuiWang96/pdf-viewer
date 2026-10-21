// Common audio formats embedded in PDFs, by file extenion
export const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
};

// The audio MIME type for a file, or null if it is not audio
// Use the type the PDF declares when it is audio; if not declared the file extension is fallback for audio
export function detectAudioType(filename: string, declaredType?: string | null): string | null {
  if (declaredType?.startsWith('audio/')) return declaredType;
  // The text after the last dot; none when there is no dot, or only a leading
  // one (a file called "mp3" has no extension)
  const dot = filename.lastIndexOf('.');
  const extension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  return AUDIO_TYPES[extension] ?? null;
}
