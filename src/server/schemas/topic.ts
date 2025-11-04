import { z } from 'zod';

export const CreateTopicSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().optional().default(''),
});

export const UpdateTopicSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
});

export type CreateTopic = z.infer<typeof CreateTopicSchema>;
export type UpdateTopic = z.infer<typeof UpdateTopicSchema>;

