import { z } from 'zod';

export const CreateCommentSchema = z.object({
  content: z.string().min(1).max(1000),
});

export const UpdateCommentSchema = z.object({
  content: z.string().min(1).max(1000),
});

export type CreateComment = z.infer<typeof CreateCommentSchema>;
export type UpdateComment = z.infer<typeof UpdateCommentSchema>;

