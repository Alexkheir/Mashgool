import { z } from 'zod';

// Frontend copy of the client DTOs. Deliberately separate from the API's copy
// (apps/api/src/dtos) — the two apps share no code package, so each owns its own
// validation. This one drives the create/edit form: same rules as the server, so
// the user gets instant feedback instead of a round-trip for obvious mistakes.
// The server re-validates regardless — the client is never trusted.

// Must match the API palette (apps/api/src/dtos/client.dto.ts). First = default.
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

export const SHORT_CODE_REGEX = /^[A-Z0-9]{2,5}$/;

export const CreateClientDto = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    shortCode: z
      .string()
      .trim()
      .regex(SHORT_CODE_REGEX, '2–5 uppercase letters or digits'),
    description: z.string().trim().max(500).optional(),
    color: z.enum(CLIENT_COLORS).optional()
  })
  .strict();

export const UpdateClientDto = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    color: z.enum(CLIENT_COLORS).optional()
  })
  .strict();

export type CreateClientInput = z.infer<typeof CreateClientDto>;
export type UpdateClientInput = z.infer<typeof UpdateClientDto>;

// Auto-suggests a short code from a client name's initials, per the Feature 8
// spec: "Brand Studio" → "BS". Single-word names fall back to their first few
// letters so we still clear the 2-char minimum ("Acme" → "ACME"). The user can
// always override the suggestion before saving.
export function suggestShortCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2 ? words.map((word) => word[0]).join('') : (words[0] ?? '');
  const cleaned = initials.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const base =
    cleaned.length >= 2
      ? cleaned
      : name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return base.slice(0, 5);
}
