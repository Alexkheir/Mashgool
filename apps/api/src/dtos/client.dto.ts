import { z } from 'zod';

// The predefined color palette a client can be labelled with. Enforced
// server-side so the API can never store an off-palette color even if a client
// crafts a raw request. The frontend keeps its own copy of this list (DTOs are
// deliberately duplicated per app — see CLAUDE.md); the two must stay in sync.
// The first entry is the schema default (see schema.prisma).
export const CLIENT_COLORS = [
  '#4A90D9', // blue (default)
  '#7B61FF', // purple
  '#E0508A', // pink
  '#E0533D', // red
  '#E8913A', // amber
  '#3DAA6E', // green
  '#3AAEB5', // teal
  '#6B7280'  // slate
] as const;

// 2–5 uppercase letters or digits. This is the immutable task-key prefix, so the
// rules are strict and validated here at the edge. Immutability itself is
// enforced structurally: UpdateClientDto simply has no `shortCode` field, and
// `.strict()` rejects any attempt to smuggle one in.
const shortCode = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{2,5}$/, 'Short code must be 2–5 uppercase letters or digits');

// `.strict()` rejects unknown keys outright (mass-assignment defence). Strings
// are trimmed so " BS " can't sneak past the uniqueness check as a distinct code.
export const CreateClientDto = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    shortCode,
    description: z.string().trim().max(500).optional(),
    color: z.enum(CLIENT_COLORS).optional()
  })
  .strict();

// Only the mutable fields. `shortCode` is intentionally absent — it can never
// change after creation. `description` is nullable so the user can clear it.
// The refine guards against a no-op empty PATCH.
export const UpdateClientDto = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    color: z.enum(CLIENT_COLORS).optional()
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update'
  });

export type CreateClientInput = z.infer<typeof CreateClientDto>;
export type UpdateClientInput = z.infer<typeof UpdateClientDto>;
