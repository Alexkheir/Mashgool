import { describe, it, expect } from 'vitest';
import {
  AudioUploadDto,
  AUDIO_MIME_EXTENSIONS,
  baseMimeType,
  ExtractTaskDto,
  MAX_AUDIO_BYTES,
  StructureTaskDto
} from './ai.dto';

// The audio DTO is the only request validation in the app that does not run
// through the `validate` middleware, so it gets its own tests rather than being
// covered incidentally by a route test.

const bytes = (n: number) => Buffer.alloc(Math.min(n, 1024));

function upload(overrides: Partial<{ mimetype: string; size: number; buffer: Buffer }> = {}) {
  return AudioUploadDto.safeParse({
    mimetype: 'audio/webm',
    size: 12_345,
    buffer: bytes(64),
    ...overrides
  });
}

describe('baseMimeType', () => {
  it('strips codec parameters', () => {
    // What MediaRecorder actually produces in Chrome. Matching on the raw string
    // would reject every browser recording the app itself made.
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(baseMimeType('audio/ogg; codecs=opus')).toBe('audio/ogg');
  });

  it('lowercases and trims', () => {
    expect(baseMimeType('  AUDIO/MPEG  ')).toBe('audio/mpeg');
  });
});

describe('AudioUploadDto', () => {
  it('accepts a browser recording', () => {
    expect(upload({ mimetype: 'audio/webm;codecs=opus' }).success).toBe(true);
  });

  it.each(Object.keys(AUDIO_MIME_EXTENSIONS))('accepts %s', (mimetype) => {
    expect(upload({ mimetype }).success).toBe(true);
  });

  it('rejects a format Whisper cannot read', () => {
    const result = upload({ mimetype: 'audio/aiff' });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.mimetype?.[0]).toMatch(/unsupported audio format/i);
  });

  it('rejects a non-audio upload', () => {
    // The obvious attempt: rename a video (or anything else) and post it.
    expect(upload({ mimetype: 'video/mp4' }).success).toBe(false);
    expect(upload({ mimetype: 'application/pdf' }).success).toBe(false);
  });

  it('rejects a file over the 25MB Whisper limit', () => {
    const result = upload({ size: MAX_AUDIO_BYTES + 1 });

    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.size?.[0]).toMatch(/25MB/);
  });

  it('accepts a file exactly at the limit', () => {
    expect(upload({ size: MAX_AUDIO_BYTES }).success).toBe(true);
  });

  it('rejects an empty file', () => {
    expect(upload({ size: 0 }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    // `.strict()` throughout (a CLAUDE.md rule) — multer's own bookkeeping is
    // projected away by the middleware rather than tolerated here.
    const result = AudioUploadDto.safeParse({
      mimetype: 'audio/webm',
      size: 100,
      buffer: bytes(64),
      destination: '/tmp'
    });

    expect(result.success).toBe(false);
  });
});

describe('AUDIO_MIME_EXTENSIONS', () => {
  it('maps every accepted type to an extension Whisper recognises', () => {
    // The extension is what the provider reads the container from, so a missing
    // or invented one is a transcription failure at the far end of the call.
    const accepted = ['mp3', 'm4a', 'wav', 'ogg', 'webm'];
    for (const extension of Object.values(AUDIO_MIME_EXTENSIONS)) {
      expect(accepted).toContain(extension);
    }
  });

  it('covers the formats Feature 14 promises, plus the recorder output', () => {
    expect(AUDIO_MIME_EXTENSIONS['audio/mpeg']).toBe('mp3');
    expect(AUDIO_MIME_EXTENSIONS['audio/mp4']).toBe('m4a');
    expect(AUDIO_MIME_EXTENSIONS['audio/wav']).toBe('wav');
    expect(AUDIO_MIME_EXTENSIONS['audio/ogg']).toBe('ogg');
    expect(AUDIO_MIME_EXTENSIONS['audio/webm']).toBe('webm');
  });
});

describe('StructureTaskDto', () => {
  it('accepts a confirmed transcript', () => {
    const result = StructureTaskDto.safeParse({ transcript: 'Send the invoice on Thursday' });

    expect(result.success).toBe(true);
  });

  it('trims before checking emptiness', () => {
    expect(StructureTaskDto.safeParse({ transcript: '   ' }).success).toBe(false);
  });

  it('rejects a transcript past the length ceiling', () => {
    expect(StructureTaskDto.safeParse({ transcript: 'a'.repeat(10_001) }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = StructureTaskDto.safeParse({
      transcript: 'ok',
      // The client does not get to choose how its own text is framed to the
      // model — the endpoint decides that.
      source: 'paste'
    });

    expect(result.success).toBe(false);
  });

  it('does not accept the paste endpoint’s field name', () => {
    // The two endpoints are separate DTOs on purpose; posting one to the other
    // should fail loudly rather than extract from an empty string.
    expect(StructureTaskDto.safeParse({ text: 'Send the invoice' }).success).toBe(false);
    expect(ExtractTaskDto.safeParse({ transcript: 'Send the invoice' }).success).toBe(false);
  });
});
