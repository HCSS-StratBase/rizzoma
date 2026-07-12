import { EMPTY_BLB_HTML } from '@shared/blbContent';

export type CreatedBlip = {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
};

/** Read the nested envelope returned by POST /api/blips. */
export function readCreatedBlip(value: unknown, now = Date.now()): CreatedBlip | null {
  if (!value || typeof value !== 'object') return null;
  const envelope = value as Record<string, unknown>;
  const id = typeof envelope['id'] === 'string'
    ? envelope['id']
    : (typeof envelope['_id'] === 'string' ? envelope['_id'] : '');
  if (!id) return null;

  const body = envelope['blip'] && typeof envelope['blip'] === 'object'
    ? envelope['blip'] as Record<string, unknown>
    : {};
  return {
    id,
    content: typeof body['content'] === 'string' && body['content'] ? body['content'] : EMPTY_BLB_HTML,
    authorId: typeof body['authorId'] === 'string' ? body['authorId'] : '',
    authorName: typeof body['authorName'] === 'string' ? body['authorName'] : 'Anonymous',
    createdAt: typeof body['createdAt'] === 'number' ? body['createdAt'] : now,
    updatedAt: typeof body['updatedAt'] === 'number' ? body['updatedAt'] : now,
  };
}
