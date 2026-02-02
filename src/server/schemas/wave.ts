import { z } from 'zod';

export const CreateWaveSchema = z.object({
  title: z.string().min(1).max(500),
});

export type Wave = {
  _id?: string;
  type: 'wave';
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type Blip = {
  _id?: string;
  type: 'blip';
  waveId: string;
  parentId?: string | null;
  content?: string;
  authorId?: string;
  authorName?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
  deletedAt?: number;
  deletedBy?: string;
  /** Shared BLB state: when true, this thread is collapsed by default for everyone. */
  isFoldedByDefault?: boolean;
  /** Character offset in parent content where this blip was created via Ctrl+Enter (inline blip). */
  anchorPosition?: number;
};

export type BlipRead = {
  _id?: string; // read:user:<userId>:wave:<waveId>:blip:<blipId>
  type: 'read';
  userId: string;
  waveId: string;
  blipId: string;
  readAt: number;
};

export type WaveParticipant = {
  _id?: string; // participant:wave:<waveId>:user:<userId>
  type: 'participant';
  waveId: string;
  userId: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  invitedBy?: string;
  invitedAt: number;
  acceptedAt?: number;
  status: 'pending' | 'accepted' | 'declined';
};
