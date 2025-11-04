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
  createdAt: number;
  updatedAt: number;
};

export type BlipRead = {
  _id?: string; // read:user:<userId>:wave:<waveId>:blip:<blipId>
  type: 'read';
  userId: string;
  waveId: string;
  blipId: string;
  readAt: number;
};
