import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AUDIO_FIELD, uploadAudio, validateAudioUpload } from './upload.middleware';
import { errorHandler } from './error.middleware';
import { MAX_AUDIO_BYTES } from '../dtos/ai.dto';
import type { AudioInput } from '../services/ai/types';

// The multipart path is the one piece of Feature 14 that cannot be tested
// through a service fake — multer only does anything given a real request body —
// so it gets a minimal app of its own.

function app() {
  const instance = express();
  instance.post('/transcribe', uploadAudio, validateAudioUpload, (_req, res) => {
    const audio = res.locals.audio as AudioInput;
    res.status(200).json({
      filename: audio.filename,
      mimeType: audio.mimeType,
      bytes: audio.data.byteLength
    });
  });
  instance.use(errorHandler);
  return instance;
}

const audioBytes = Buffer.from('fake-audio-bytes');

describe('uploadAudio + validateAudioUpload', () => {
  it('accepts a recording and normalises its name from the verified type', async () => {
    const response = await request(app())
      .post('/transcribe')
      // What the browser actually posts: a nameless blob with a codec parameter.
      .attach(AUDIO_FIELD, audioBytes, { filename: 'blob', contentType: 'audio/webm;codecs=opus' });

    expect(response.status).toBe(200);
    // The client's filename is discarded — Whisper reads the container from the
    // extension, and "blob" has none.
    expect(response.body.filename).toBe('voice-note.webm');
    expect(response.body.mimeType).toBe('audio/webm');
    expect(response.body.bytes).toBe(audioBytes.byteLength);
  });

  it('maps an uploaded m4a to its own extension', async () => {
    const response = await request(app())
      .post('/transcribe')
      .attach(AUDIO_FIELD, audioBytes, { filename: 'note.m4a', contentType: 'audio/mp4' });

    expect(response.status).toBe(200);
    expect(response.body.filename).toBe('voice-note.m4a');
  });

  it('rejects an unsupported format with an actionable message', async () => {
    const response = await request(app())
      .post('/transcribe')
      .attach(AUDIO_FIELD, audioBytes, { filename: 'note.aiff', contentType: 'audio/aiff' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/unsupported audio format/i);
  });

  it('rejects a request with no file', async () => {
    const response = await request(app()).post('/transcribe');

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(new RegExp(AUDIO_FIELD));
  });

  it('rejects a file over the size limit with a 413', async () => {
    const oversized = Buffer.alloc(MAX_AUDIO_BYTES + 1024);

    const response = await request(app())
      .post('/transcribe')
      .attach(AUDIO_FIELD, oversized, { filename: 'long.mp3', contentType: 'audio/mpeg' });

    expect(response.status).toBe(413);
    expect(response.body.message).toMatch(/25MB/);
  });

  it('rejects a second file rather than silently taking the first', async () => {
    const response = await request(app())
      .post('/transcribe')
      .attach(AUDIO_FIELD, audioBytes, { filename: 'a.mp3', contentType: 'audio/mpeg' })
      .attach('extra', audioBytes, { filename: 'b.mp3', contentType: 'audio/mpeg' });

    expect(response.status).toBe(400);
  });

  it('rejects extra text fields', async () => {
    // The endpoint takes audio and nothing else — the multipart equivalent of a
    // `.strict()` DTO.
    const response = await request(app())
      .post('/transcribe')
      .field('clientId', 'some-client')
      .attach(AUDIO_FIELD, audioBytes, { filename: 'a.mp3', contentType: 'audio/mpeg' });

    expect(response.status).toBe(400);
  });
});
