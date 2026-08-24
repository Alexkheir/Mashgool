import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractTaskFromText } from './extraction.service';
import { AiProviderError, type ExtractedTask, type TaskExtractionProvider } from './types';
import { AppError } from '../../middleware/error.middleware';

// The audit write is fire-and-forget and hits Prisma; stub it so these tests
// stay free of a database while still asserting what would be logged.
vi.mock('../audit.service', () => ({ writeAuditLog: vi.fn() }));
import { writeAuditLog } from '../audit.service';

const USER_ID = 'user-1';

function fullTask(overrides: Partial<ExtractedTask> = {}): ExtractedTask {
  return {
    hasActionableTask: true,
    title: 'Design the logo',
    description: null,
    dueDate: '2099-01-15',
    priority: 'HIGH',
    confidence: { title: 'high', dueDate: 'low', priority: 'high' },
    ...overrides
  };
}

// A stand-in provider. Its existence is the point of the port: the service can
// be exercised end to end without an SDK, a network call, or an API key.
function fakeProvider(
  impl: TaskExtractionProvider['extractTask'],
  id = 'fake'
): TaskExtractionProvider {
  return { id, model: 'fake-model-1', extractTask: impl };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('extractTaskFromText', () => {
  it('returns the provider result together with which provider produced it', async () => {
    const provider = fakeProvider(async () => fullTask());

    const result = await extractTaskFromText(USER_ID, 'Need a logo by Friday', provider);

    expect(result.extraction.title).toBe('Design the logo');
    expect(result.provider).toEqual({ id: 'fake', model: 'fake-model-1' });
  });

  it("passes today's date to the provider so relative dates resolve", async () => {
    const seen: string[] = [];
    const provider = fakeProvider(async ({ today }) => {
      seen.push(today);
      return fullTask();
    });

    await extractTaskFromText(USER_ID, 'by Friday', provider);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(seen[0]).toBe(new Date().toISOString().slice(0, 10));
  });

  it('never puts the raw message in the audit log', async () => {
    const secret = 'Confidential client message about the merger';
    const provider = fakeProvider(async () => fullTask());

    await extractTaskFromText(USER_ID, secret, provider);

    const entry = vi.mocked(writeAuditLog).mock.calls[0]![0];
    const serialised = JSON.stringify(entry);
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain('merger');
    // The length is kept as a usage signal — the content is not.
    expect(entry.metadata).toMatchObject({ inputLength: secret.length });
  });

  it('audits the outcome fields and the provider used', async () => {
    const provider = fakeProvider(async () => fullTask());

    await extractTaskFromText(USER_ID, 'text', provider);

    const entry = vi.mocked(writeAuditLog).mock.calls[0]![0];
    expect(entry.action).toBe('AI_EXTRACTION_TRIGGERED');
    expect(entry.userId).toBe(USER_ID);
    expect(entry.metadata).toMatchObject({
      via: 'paste',
      providerId: 'fake',
      model: 'fake-model-1',
      hasActionableTask: true,
      fields: { title: true, description: false, dueDate: true, priority: 'HIGH' }
    });
  });

  it('treats "no actionable task" as a success, not an error', async () => {
    const provider = fakeProvider(async () =>
      fullTask({
        hasActionableTask: false,
        title: null,
        dueDate: null,
        priority: null,
        confidence: { title: null, dueDate: null, priority: null }
      })
    );

    const result = await extractTaskFromText(USER_ID, 'thanks!', provider);

    expect(result.extraction.hasActionableTask).toBe(false);
    // Still audited — knowing how often extraction finds nothing is the point.
    expect(writeAuditLog).toHaveBeenCalledOnce();
    expect(vi.mocked(writeAuditLog).mock.calls[0]![0].description).toMatch(/no actionable task/i);
  });

  // Each provider failure has to reach the client as something it can act on.
  it.each([
    ['rate_limit', 429],
    ['timeout', 504],
    ['unavailable', 503],
    ['auth', 503],
    ['invalid_output', 502]
  ] as const)('maps a %s provider failure to HTTP %i', async (kind, status) => {
    const provider = fakeProvider(async () => {
      throw new AiProviderError(kind, 'boom', 'fake');
    });

    const error = await extractTaskFromText(USER_ID, 'text', provider).catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(status);
  });

  it('maps an auth failure to 503, never 401', async () => {
    // A 401 would be read by the frontend's auth handling as an expired session
    // and bounce the user to the login page over a server-side misconfiguration.
    const provider = fakeProvider(async () => {
      throw new AiProviderError('auth', 'bad key', 'fake');
    });

    const error = await extractTaskFromText(USER_ID, 'text', provider).catch((e) => e);

    expect((error as AppError).statusCode).not.toBe(401);
    expect((error as AppError).statusCode).toBe(503);
  });

  it('never leaks the provider error text to the client', async () => {
    const provider = fakeProvider(async () => {
      throw new AiProviderError('auth', 'invalid x-api-key sk-ant-secret123', 'fake');
    });

    const error = await extractTaskFromText(USER_ID, 'text', provider).catch((e) => e);

    expect((error as AppError).message).not.toContain('sk-ant-secret123');
    expect((error as AppError).message).not.toContain('x-api-key');
  });

  it('does not audit a failed extraction', async () => {
    const provider = fakeProvider(async () => {
      throw new AiProviderError('unavailable', 'boom', 'fake');
    });

    await extractTaskFromText(USER_ID, 'text', provider).catch(() => undefined);

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('lets a non-provider error through untouched', async () => {
    // A bug in our own code must not be disguised as a provider outage.
    const provider = fakeProvider(async () => {
      throw new TypeError('cannot read property of undefined');
    });

    const error = await extractTaskFromText(USER_ID, 'text', provider).catch((e) => e);

    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(AppError);
  });
});
