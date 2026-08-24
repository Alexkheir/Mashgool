import { z } from 'zod';

// Feature 13 explicitly sets no character *minimum* — a two-word message can
// still carry a task — so the only floor is that something was actually pasted.
// The ceiling is a cost bound rather than a product rule: a client message is
// chat, and 10k characters is far past the longest real one while keeping any
// single extraction's token spend predictable.
export const ExtractTaskDto = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'Paste a message to extract a task from')
      .max(10_000, 'Message is too long to extract from — paste the relevant part')
  })
  .strict();

export type ExtractTaskInput = z.infer<typeof ExtractTaskDto>;
