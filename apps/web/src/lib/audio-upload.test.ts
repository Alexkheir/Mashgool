import { describe, it, expect } from 'vitest';
import {
  ACCEPTED_EXTENSIONS,
  extensionOf,
  MAX_UPLOAD_BYTES,
  rejectAudioFile,
  uploadMimeType
} from './audio-upload';
import { formatSeconds, MAX_RECORDING_SECONDS } from './use-recorder';

const file = (name: string, size = 1024) => ({ name, size });

describe('extensionOf', () => {
  it('lowercases the extension', () => {
    expect(extensionOf('Voice Note.MP3')).toBe('mp3');
  });

  it('takes the last segment of a multi-dot name', () => {
    expect(extensionOf('call.2026-08-27.m4a')).toBe('m4a');
  });

  it('returns nothing for a name with no extension', () => {
    // A MediaRecorder blob saved by hand often ends up like this — it must not
    // read as an extension of "recording".
    expect(extensionOf('recording')).toBe('');
  });
});

describe('rejectAudioFile', () => {
  it.each(ACCEPTED_EXTENSIONS)('accepts a .%s file', (extension) => {
    expect(rejectAudioFile(file(`note.${extension}`))).toBeNull();
  });

  it('names the accepted formats when the type is wrong', () => {
    const reason = rejectAudioFile(file('note.aiff'));

    expect(reason).toMatch(/isn't supported/);
    for (const extension of ACCEPTED_EXTENSIONS) expect(reason).toContain(extension);
  });

  it('rejects a renamed non-audio file', () => {
    expect(rejectAudioFile(file('invoice.pdf'))).not.toBeNull();
    expect(rejectAudioFile(file('clip.mp4'))).not.toBeNull();
  });

  it('rejects a file over the 25MB Whisper limit', () => {
    expect(rejectAudioFile(file('long.mp3', MAX_UPLOAD_BYTES + 1))).toMatch(/25MB/);
  });

  it('accepts a file exactly at the limit', () => {
    expect(rejectAudioFile(file('long.mp3', MAX_UPLOAD_BYTES))).toBeNull();
  });

  it('rejects an empty file before the size check', () => {
    expect(rejectAudioFile(file('silent.wav', 0))).toMatch(/empty/);
  });
});

describe('uploadMimeType', () => {
  it('keeps the type the browser reported', () => {
    expect(uploadMimeType('note.mp3', 'audio/mpeg')).toBe('audio/mpeg');
  });

  it('strips codec parameters from a recorded blob', () => {
    expect(uploadMimeType('', 'audio/webm;codecs=opus')).toBe('audio/webm');
  });

  it('infers the type from the extension when the browser reports none', () => {
    // The case this exists for: File.type is empty for an .m4a or .ogg the OS
    // has no handler for, and the upload would otherwise be rejected as
    // application/octet-stream.
    expect(uploadMimeType('note.m4a', '')).toBe('audio/mp4');
    expect(uploadMimeType('note.ogg', '')).toBe('audio/ogg');
    expect(uploadMimeType('note.wav', '')).toBe('audio/wav');
  });

  it('overrides a useless octet-stream', () => {
    expect(uploadMimeType('note.mp3', 'application/octet-stream')).toBe('audio/mpeg');
  });

  it('falls back to webm for a nameless, typeless blob', () => {
    expect(uploadMimeType('', '')).toBe('audio/webm');
  });
});

describe('formatSeconds', () => {
  it('pads the seconds', () => {
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(7)).toBe('0:07');
    expect(formatSeconds(42)).toBe('0:42');
  });

  it('rolls over to minutes', () => {
    expect(formatSeconds(60)).toBe('1:00');
    expect(formatSeconds(75)).toBe('1:15');
  });

  it('renders the recording cap the way the timer shows it', () => {
    expect(formatSeconds(MAX_RECORDING_SECONDS)).toBe('1:00');
  });
});
