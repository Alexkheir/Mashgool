import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transcribeAudio } from './transcription.service';
import { AiProviderError, type AudioInput, type TranscriptionProvider } from './types';
import { AppError } from '../../middleware/error.middleware';

// Same shape as the extraction suite, for the sibling capability: a fake
// provider stands in for the SDK, so the service is exercised end to end with no
// network, no API key, and no audio file.
vi.mock('../audit.service', () => ({ writeAuditLog: vi.fn() }));
import { writeAuditLog } from '../audit.service';

const USER_ID = 'user-1';

function audio(overrides: Partial<AudioInput> = {}): AudioInput {
  return {
    data: Buffer.from('fake-audio-bytes'),
    mimeType: 'audio/webm',
    filename: 'voice-note.webm',
    ...overrides
  };
}

function fakeProvider(
  impl: TranscriptionProvider['transcribe'],
  id = 'fake'
): TranscriptionProvider {
  return { id, model: 'fake-whisper-1', transcribe: impl };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('transcribeAudio', () => {
  it('returns the transcript and which provider produced it', async () => {
    const provider = fakeProvider(async () => ({ text: 'Send the invoice on Thursday' }));

    const result = await transcribeAudio(USER_ID, audio(), provider);

    expect(result.transcript).toBe('Send the invoice on Thursday');
    expect(result.provider).toEqual({ id: 'fake', model: 'fake-whisper-1' });
  });

  it('hands the audio to the provider unchanged', async () => {
    const seen: AudioInput[] = [];
    const provider = fakeProvider(async ({ audio: given }) => {
      seen.push(given);
      return { text: 'ok' };
    });
    const input = audio({ filename: 'voice-note.m4a', mimeType: 'audio/mp4' });

    await transcribeAudio(USER_ID, input, provider);

    expect(seen[0]).toEqual(input);
  });

  it('sends no language hint, so the provider detects the language itself', async () => {
    // Pinning a language would make Whisper translate rather than transcribe,
    // which would quietly break every Arabic note.
    let language: string | undefined = 'unset';
    const provider = fakeProvider(async (request) => {
      language = request.language;
      return { text: 'ARABIC_TRANSCRIPT' };
    });

    const result = await transcribeAudio(USER_ID, audio(), provider);

    expect(language).toBeUndefined();
    expect(result.transcript).toBe('ARABIC_TRANSCRIPT');
  });

  it('trims surrounding whitespace from the transcript', async () => {
    const provider = fakeProvider(async () => ({ text: '  Design the logo\n' }));

    const result = await transcribeAudio(USER_ID, audio(), provider);

    expect(result.transcript).toBe('Design the logo');
  });

  it('rejects an empty transcript with a 422, not a provider failure', async () => {
    // Silence is a well-formed answer: nothing broke, there is just nothing to
    // structure. 422 says exactly that, and the UI turns it into "record again".
    const provider = fakeProvider(async () => ({ text: '   ' }));

    const error = await transcribeAudio(USER_ID, audio(), provider).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(422);
    expect((error as AppError).message).toMatch(/no speech/i);
  });

  it('still audits a silent recording', async () => {
    const provider = fakeProvider(async () => ({ text: '' }));

    await transcribeAudio(USER_ID, audio(), provider).catch(() => undefined);

    expect(writeAuditLog).toHaveBeenCalledOnce();
    const entry = vi.mocked(writeAuditLog).mock.calls[0]![0];
    expect(entry.description).toMatch(/no detectable speech/i);
    expect(entry.metadata).toMatchObject({ transcriptLength: 0 });
  });

  it('never puts the transcript in the audit log', async () => {
    const spoken = 'tell the client the retainer is going up next month';
    const provider = fakeProvider(async () => ({ text: spoken }));

    await transcribeAudio(USER_ID, audio(), provider);

    const entry = vi.mocked(writeAuditLog).mock.calls[0]![0];
    const serialised = JSON.stringify(entry);
    expect(serialised).not.toContain(spoken);
    expect(serialised).not.toContain('retainer');
    // Length and size are kept as usage signals — the words are not.
    expect(entry.metadata).toMatchObject({
      transcriptLength: spoken.length,
      audioBytes: Buffer.from('fake-audio-bytes').byteLength
    });
  });

  it('audits the provider and model used', async () => {
    const provider = fakeProvider(async () => ({ text: 'ok' }));

    await transcribeAudio(USER_ID, audio(), provider);

    const entry = vi.mocked(writeAuditLog).mock.calls[0]![0];
    expect(entry.action).toBe('AI_TRANSCRIPTION_TRIGGERED');
    expect(entry.userId).toBe(USER_ID);
    expect(entry.metadata).toMatchObject({
      via: 'voice',
      providerId: 'fake',
      model: 'fake-whisper-1',
      mimeType: 'audio/webm'
    });
  });

  it.each([
    ['rate_limit', 429],
    ['timeout', 504],
    ['unavailable', 503],
    ['auth', 503],
    ['invalid_output', 502],
    ['invalid_input', 400]
  ] as const)('maps a %s provider failure to HTTP %i', async (kind, status) => {
    const provider = fakeProvider(async () => {
      throw new AiProviderError(kind, 'boom', 'fake');
    });

    const error = await transcribeAudio(USER_ID, audio(), provider).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(status);
  });

  it('maps an auth failure to 503, never 401', async () => {
    // Identical reasoning to extraction: a 401 would read to the frontend as an
    // expired session and log the user out over a missing server-side API key.
    const provider = fakeProvider(async () => {
      throw new AiProviderError('auth', 'bad key', 'fake');
    });

    const error = await transcribeAudio(USER_ID, audio(), provider).catch((e) => e);

    expect((error as AppError).statusCode).toBe(503);
  });

  it('never leaks the provider error text to the client', async () => {
    const provider = fakeProvider(async () => {
      throw new AiProviderError('auth', 'invalid credential sk-proj-secret456', 'fake');
    });

    const error = await transcribeAudio(USER_ID, audio(), provider).catch((e) => e);

    expect((error as AppError).message).not.toContain('sk-proj-secret456');
    expect((error as AppError).message).not.toContain('credential');
  });

  it('does not audit a failed transcription', async () => {
    const provider = fakeProvider(async () => {
      throw new AiProviderError('unavailable', 'boom', 'fake');
    });

    await transcribeAudio(USER_ID, audio(), provider).catch(() => undefined);

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('lets a non-provider error through untouched', async () => {
    const provider = fakeProvider(async () => {
      throw new TypeError('cannot read property of undefined');
    });

    const error = await transcribeAudio(USER_ID, audio(), provider).catch((e) => e);

    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(AppError);
  });
});
