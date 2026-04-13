import { z } from 'zod';

// Per-section author attribution sidecar. Keyed by a stable block
// text-hash computed on the client so edits to a specific block
// update that block's entry while untouched blocks carry forward.
// Client-side computation keeps the server out of the HTML-parsing
// business; the server just persists whatever map the client sends.
export const SectionAttributionEntrySchema = z.object({
  authorId: z.string(),
  updatedAt: z.number(),
});

export const SectionAttributionSchema = z.record(z.string(), SectionAttributionEntrySchema);

export const CreateTopicSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional().default(''),
});

export const UpdateTopicSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  sectionAttribution: SectionAttributionSchema.optional(),
});

export type CreateTopic = z.infer<typeof CreateTopicSchema>;
export type UpdateTopic = z.infer<typeof UpdateTopicSchema>;
export type SectionAttributionEntry = z.infer<typeof SectionAttributionEntrySchema>;
export type SectionAttribution = z.infer<typeof SectionAttributionSchema>;
