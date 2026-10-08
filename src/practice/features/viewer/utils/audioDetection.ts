// Common audio formats embedded in PDFs, by file extenion
export const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  acc: 'audio/acc',
  ogg: 'audio/ogg',
};

// The audio MIME type for a file, or null if it is not audio
// Use the type the PDF declares when it is audio; if not declared the file extension is fallback for audio
export function detectAudioType(filename: string, declaredType?: string | null): string | null {
  if (declaredType?.startsWith('audio/')) return declaredType;
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_TYPES[extension] ?? null;
}
