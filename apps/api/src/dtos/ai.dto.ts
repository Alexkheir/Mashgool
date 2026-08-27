import { z } from 'zod';

// Feature 13 explicitly sets no character *minimum* — a two-word message can
// still carry a task — so the only floor is that something was actually pasted.
// The ceiling is a cost bound rather than a product rule: a client message is
// chat, and 10k characters is far past the longest real one while keeping any
// single extraction's token spend predictable.
export const ExtractTaskDto = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Paste a message to extract a task from')
      .max(10_000, 'Message is too long to extract from — paste the relevant part')
  })
  .strict();

export type ExtractTaskInput = z.infer<typeof ExtractTaskDto>;

// ─── Voice to task (Feature 14) ──────────────────────────────────────────────

// The confirmed transcript, on its way to the same extraction the pasted message
// gets. Its own DTO rather than a reuse of ExtractTaskDto: the field is named for
// what it is at this step, and the two can diverge later without one endpoint's
// limits silently moving the other's.
//
// The same 10k ceiling applies, and it is generous here — a 60-second note
// transcribes to a few hundred characters — but the transcript is editable
// before it is sent, so the bound is on what the user can submit, not on what
// Whisper produced.
export const StructureTaskDto = z
  .object({
    transcript: z
      .string()
      .trim()
      .min(1, 'The transcript is empty — record again or type the task yourself')
      .max(10_000, 'That transcript is too long to structure — trim it to the relevant part')
  })
  .strict();

export type StructureTaskInput = z.infer<typeof StructureTaskDto>;

// What the audio endpoint accepts, mapped to the file extension Whisper needs to
// see. The mapping is the point: OpenAI infers the container from the *file
// name*, so an upload arriving as "blob" or "recording" transcribes as a 400
// until it is given a name with a real extension. Deriving the extension from
// the verified MIME type — rather than trusting whatever name the client sent —
// means every request reaches the provider with a name it can read.
//
// Feature 14 lists .mp3, .m4a, .wav and .ogg as the upload formats. webm is here
// because it is not an upload format at all: it is what MediaRecorder produces
// in Chrome and Firefox, so leaving it out would mean rejecting our own
// recorder's output. Safari records to audio/mp4, which m4a already covers.
export const AUDIO_MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/opus': 'ogg',
  'audio/webm': 'webm'
};

// Whisper's own hard limit. Stated to the user before they upload (a Feature 14
// rule) and enforced here, so an oversized file is refused locally instead of
// being uploaded twice — once to us, once to OpenAI — before being rejected.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// A recorded blob arrives as `audio/webm;codecs=opus`, not `audio/webm`. The
// parameters after the semicolon are part of a valid MIME type and must be
// stripped before matching, or every Chrome recording fails validation.
export function baseMimeType(raw: string): string {
  return raw.split(';')[0]!.trim().toLowerCase();
}

// Validates the file multer parsed off the multipart body. It is not a JSON body,
// so it does not go through the `validate` middleware — but it is still request
// input, so it still passes a `.strict()` Zod schema before anything reads it
// (a CLAUDE.md rule). The controller projects multer's file object onto these
// three fields; multer's own bookkeeping (fieldname, encoding, …) is not input we
// have any use for.
export const AudioUploadDto = z
  .object({
    mimetype: z
      .string()
      .refine((value) => baseMimeType(value) in AUDIO_MIME_EXTENSIONS, {
        message: 'Unsupported audio format. Use MP3, M4A, WAV or OGG.'
      }),
    size: z
      .number()
      .int()
      .positive('That audio file is empty')
      .max(MAX_AUDIO_BYTES, 'Audio must be 25MB or smaller'),
    buffer: z.instanceof(Buffer)
  })
  .strict();

export type AudioUploadInput = z.infer<typeof AudioUploadDto>;
