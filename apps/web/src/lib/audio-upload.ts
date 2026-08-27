// The upload fallback's rules (Feature 14), checked in the browser before any
// audio leaves it. A separate copy of the server's constraints by design
// (CLAUDE.md: frontend and backend DTOs are separate) — the API still enforces
// its own, and this exists so a wrong file costs a message rather than a 25MB
// round trip.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Named by extension rather than MIME type because that is what the user sees in
// their file browser, and what the error message has to say back to them.
export const ACCEPTED_EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg'] as const;

// The `accept` attribute. Extensions and MIME types both, because platforms
// disagree about which one they honour in the file picker.
export const ACCEPT_ATTRIBUTE = '.mp3,.m4a,.wav,.ogg,audio/mpeg,audio/mp4,audio/wav,audio/ogg';

// The MIME type each accepted extension should travel as. Needed because a
// browser does not always know: `File.type` comes from the OS, and an .m4a or
// .ogg with no registered handler arrives as an empty string. Uploading that
// sends `application/octet-stream`, which the API rightly refuses — so the type
// is inferred from the name instead of being left blank.
export const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm'
};

export function extensionOf(filename: string): string {
  // `split('.').pop()` on a name with no dot returns the name itself, which would
  // let "recording" pass as an extension — so an actual dot is required.
  if (!filename.includes('.')) return '';
  return filename.split('.').pop()!.toLowerCase();
}

// Returns the reason the file can't be used, or null when it can. A string
// rather than a boolean: every rejection here is shown to the user verbatim, and
// "which rule did it break" is the whole content of that message.
export function rejectAudioFile(file: { name: string; size: number }): string | null {
  const extension = extensionOf(file.name);

  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)) {
    return `That file type isn't supported. Use ${ACCEPTED_EXTENSIONS.join(', ')}.`;
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'That file is over 25MB. Trim it, or record a shorter note.';
  }
  return null;
}

// What an audio file should be uploaded as: its own type when the browser knows
// one, the type its extension implies when it does not, and webm as the last
// resort (the format the recorder produces, so the likeliest truth for a blob
// with no name at all).
export function uploadMimeType(filename: string, declaredType: string): string {
  // A recorded blob's type carries codec parameters — `audio/webm;codecs=opus`.
  // The API strips them too, but sending the bare type keeps the two ends
  // reading the same string.
  const declared = declaredType.split(';')[0]?.trim().toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  return MIME_BY_EXTENSION[extensionOf(filename)] ?? 'audio/webm';
}
