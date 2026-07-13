import { z } from 'zod';

// Per-section author attribution sidecar returned to clients. Authorship is
// derived server-side; UpdateTopicSchema deliberately does not accept it.
export const SectionAttributionEntrySchema = z.object({
  authorId: z.string(),
  updatedAt: z.number(),
});

export const SectionAttributionSchema = z.record(z.string(), SectionAttributionEntrySchema);

export const CreateTopicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().optional().default(''),
  participants: z.array(z.string().trim().email().max(320).transform((email) => email.toLowerCase())).max(20).optional(),
});

export const UpdateTopicSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().optional(),
});

export type CreateTopic = z.infer<typeof CreateTopicSchema>;
export type UpdateTopic = z.infer<typeof UpdateTopicSchema>;
export type SectionAttributionEntry = z.infer<typeof SectionAttributionEntrySchema>;
export type SectionAttribution = z.infer<typeof SectionAttributionSchema>;
