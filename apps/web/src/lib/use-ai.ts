'use client';

import { useMutation } from '@tanstack/react-query';
import { request } from './use-clients';
import type { TaskPriority } from '@/dtos/task.dto';

// Paste-to-task extraction (Feature 13). A mutation rather than a query: it has
// a side effect (it spends money and writes an audit entry), it is triggered by
// an explicit user action, and it must never be re-run automatically on a
// refocus or a retry the way a cached query would be.

export type FieldConfidence = 'high' | 'low';

// Mirrors the API's ExtractedTask. Every field but the flag is nullable — the
// "no actionable task" answer populates none of them.
export interface ExtractedTask {
  hasActionableTask: boolean;
  title: string | null;
  description: string | null;
  // A calendar day, `YYYY-MM-DD`.
  dueDate: string | null;
  priority: TaskPriority | null;
  confidence: {
    title: FieldConfidence | null;
    dueDate: FieldConfidence | null;
    priority: FieldConfidence | null;
  };
}

export interface ExtractionResponse {
  extraction: ExtractedTask;
  provider: { id: string; model: string };
}

export function useExtractTask() {
  return useMutation({
    mutationFn: (text: string) =>
      request<ExtractionResponse>('/api/v1/ai/extract', {
        method: 'POST',
        body: JSON.stringify({ text })
      }),
    // No retry. A failed extraction returns the user to the input step with
    // their text intact (Feature 13: "can retry without re-entering text"), so
    // retrying is their decision — a silent retry would double the cost and the
    // wait without telling them anything.
    retry: false
  });
}
