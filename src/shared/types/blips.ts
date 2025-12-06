export type BlipHistoryEntry = {
  id: string;
  blipId: string;
  waveId: string;
  content: string;
  authorId?: string;
  authorName?: string;
  event: 'create' | 'update';
  createdAt: number;
  updatedAt: number;
  snapshotVersion: number;
};
