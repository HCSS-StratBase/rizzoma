import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  insertDoc: vi.fn(),
  find: vi.fn().mockResolvedValue({ docs: [] }),
  findOne: vi.fn().mockResolvedValue(null),
  getDocsById: vi.fn().mockResolvedValue({}),
  deleteDoc: vi.fn(),
}));
vi.mock('../server/lib/socket.js', () => ({
  clearBlipSeedAuthority: vi.fn(),
  emitEvent: vi.fn(),
  hasWritableBlipSocket: vi.fn(() => false),
  revokeBlipSockets: vi.fn(() => 0),
}));

const couch = vi.mocked(await import('../server/lib/couch.js'));
const { touchTopic } = await import('../server/routes/blips');

describe('touchTopic: two people adding blips at the same moment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    couch.getDoc.mockResolvedValue({ _id: 'topic1', _rev: '1-a', type: 'topic', createdAt: 1 } as any);
  });

  it('re-reads and retries a revision conflict instead of logging an error and dropping the activity time', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    couch.updateDoc
      .mockRejectedValueOnce(new Error('409 Document update conflict.'))
      .mockRejectedValueOnce(new Error('409 Document update conflict.'))
      .mockResolvedValue({ ok: true } as any);
    await touchTopic('topic1');
    expect(couch.updateDoc).toHaveBeenCalledTimes(3);
    expect(couch.getDoc).toHaveBeenCalledTimes(3);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('stays quiet when writers keep conflicting (the activity time is fresh anyway) but reports a real failure', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    couch.updateDoc.mockRejectedValue(new Error('409 Document update conflict.'));
    await touchTopic('topic1');
    expect(couch.updateDoc).toHaveBeenCalledTimes(5);
    expect(err).not.toHaveBeenCalled();
    couch.updateDoc.mockReset();
    couch.updateDoc.mockRejectedValue(new Error('500 disk full'));
    await touchTopic('topic1');
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
