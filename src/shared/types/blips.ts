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

export type WaveHistoryResponse = {
  history: BlipHistoryEntry[];
  total: number;
  hasMore: boolean;
  blipIds: string[];
  dateRange: { earliest: number; latest: number };
};
