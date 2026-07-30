import type { AuditAction, EntityType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

interface AuditEntry {
  userId: string;
  action: AuditAction;
  entityType?: EntityType;
  entityId?: string;
  description: string;
  // Extracted output fields / small context only — NEVER raw AI input or secrets
  // (a CLAUDE.md rule). Kept as structured JSON on the row.
  metadata?: Prisma.InputJsonValue;
}

// Append-only, fire-and-forget. Callers do NOT await this: the insert is kicked
// off and its promise is swallowed here, so an audit failure can neither throw
// into nor slow down the operation being logged. Returns void deliberately, so a
// caller can't accidentally `await` a rejection. The audit log is a record of
// what happened, never a gate on it happening.
export function writeAuditLog(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        description: entry.description,
        metadata: entry.metadata
      }
    })
    .catch((error) => {
      // Log the failure but never rethrow — audit must not break the app.
      console.error('Audit log write failed:', error);
    });
}
