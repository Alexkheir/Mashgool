import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import {
  AUDIO_MIME_EXTENSIONS,
  AudioUploadDto,
  baseMimeType,
  MAX_AUDIO_BYTES
} from '../dtos/ai.dto';
import { AppError } from './error.middleware';

// Multipart parsing for the one endpoint that takes a file (Feature 14).
//
// `express.json()` cannot read a multipart body, so a voice note needs its own
// parser. It is scoped to this middleware rather than mounted app-wide: every
// other route takes JSON, and a global multipart parser would be a body-size
// hole on all of them.

// The form field name the audio arrives under. Exported so the frontend's
// FormData key and the server's expectation cannot drift apart silently.
export const AUDIO_FIELD = 'audio';

const parseAudio = multer({
  // In memory, never on disk. A voice note is transient input on its way to
  // Whisper — writing it to the container filesystem would leave a copy of
  // someone's speech behind, and would need cleaning up on every error path.
  storage: multer.memoryStorage(),
  limits: {
    // Enforced twice, deliberately: here as a *stream* limit that stops reading
    // at the cap, and again in the DTO as a check on what arrived. The stream
    // limit is what prevents a 2GB upload from being buffered into memory before
    // anyone gets a chance to reject it.
    fileSize: MAX_AUDIO_BYTES,
    files: 1,
    // No text fields: this endpoint takes audio and nothing else. The same
    // reflex as `.strict()` on a Zod DTO — reject the unexpected rather than
    // ignore it.
    fields: 0
  }
}).single(AUDIO_FIELD);

export function uploadAudio(req: Request, res: Response, next: NextFunction) {
  parseAudio(req, res, (error: unknown) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      // 413 rather than 400: the request was well-formed, it was just too big,
      // and the client can act on the difference by offering a shorter note.
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'Audio must be 25MB or smaller.'));
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
        return next(new AppError(400, `Send one recording, as a single "${AUDIO_FIELD}" file field.`));
      }
      return next(new AppError(400, 'Could not read the uploaded audio.'));
    }

    // Anything else is not an upload problem — hand it to the global handler,
    // which logs it and returns a generic 500.
    return next(error);
  });
}

// The DTO half, split from the parsing half for the same reason `validate` is
// separate from `express.json()`: multer's job ends at "there is a file here",
// and what that file is allowed to be is a product rule.
//
// The verified, normalised result is stashed on `res.locals.audio` rather than
// written back onto the request — the same convention `validateQuery` uses for
// Express 5's read-only getters, and it keeps the controller reading input from
// one obvious place.
export function validateAudioUpload(req: Request, res: Response, next: NextFunction) {
  if (!req.file) {
    return next(new AppError(400, `Attach a recording as the "${AUDIO_FIELD}" field.`));
  }

  // Projected onto exactly the three fields we use, so multer's bookkeeping
  // (fieldname, encoding, destination, …) never reaches a `.strict()` schema
  // that would rightly reject it.
  const result = AudioUploadDto.safeParse({
    mimetype: req.file.mimetype,
    size: req.file.size,
    buffer: req.file.buffer
  });

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    // The top-level message is the one the UI renders. A file-format complaint
    // has no form field to attach itself to, so the specific reason is promoted
    // rather than left buried under a generic "Validation failed".
    const message = Object.values(errors).flat()[0] ?? 'That audio file could not be accepted.';
    return res.status(400).json({ message, errors });
  }

  const mimeType = baseMimeType(result.data.mimetype);

  res.locals.audio = {
    data: result.data.buffer,
    mimeType,
    // A name built from the verified type, never the client's. See the comment
    // on AUDIO_MIME_EXTENSIONS: Whisper reads the container from the extension,
    // so a browser blob posted as "blob" would otherwise be rejected on arrival.
    filename: `voice-note.${AUDIO_MIME_EXTENSIONS[mimeType]}`
  };

  next();
}
