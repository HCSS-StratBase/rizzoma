import { describe, it, expect } from 'vitest';
import type { BlipData } from '../client/components/blip/RizzomaBlip';
import {
  LOCAL_WRITE_TTL_MS,
  createLocalWrites,
  forgetBlip,
  overlayLocalBlips,
  overlayLocalTopic,
  recordCreatedBlip,
  recordSavedBlipContent,
  recordSavedTopic,
} from '../client/lib/topicLoadReconcile';

const blip = (id: string, extra: Partial<BlipData> = {}): BlipData => ({
  id,
  blipPath: id,
  content: '<ul><li><p></p></li></ul>',
  authorId: 'u',
  authorName: 'U',
  createdAt: 1,
  updatedAt: 1,
  yjsGeneration: 0,
  isRead: true,
  childBlips: [],
  permissions: { canEdit: true, canComment: true, canRead: true },
  contributors: [],
  ...extra,
});

describe('topic reload reconcile: a reload never undoes this tab\'s own newer writes', () => {
  it('puts back a child created after the reload request started (the vanished child and lost text)', () => {
    const w = createLocalWrites();
    recordCreatedBlip(w, blip('w:child', { anchorPosition: 0 }), 1000);
    const loaded = new Map<string, BlipData>([['w:other', blip('w:other')]]);
    // request started at 900 (before the child landed at 1000), answer predates the child
    expect(overlayLocalBlips(loaded, w, 900)).toBe(true);
    expect(loaded.has('w:child')).toBe(true);
    expect(loaded.get('w:child')!.anchorPosition).toBe(0);
  });

  it('does not touch an answer that was requested after the write (it already contains it)', () => {
    const w = createLocalWrites();
    recordCreatedBlip(w, blip('w:child'), 1000);
    const loaded = new Map<string, BlipData>();
    expect(overlayLocalBlips(loaded, w, 1001)).toBe(false);
    expect(loaded.size).toBe(0);
  });

  it('keeps the server copy when the answer already has the child', () => {
    const w = createLocalWrites();
    recordCreatedBlip(w, blip('w:child', { content: 'local' }), 1000);
    const loaded = new Map<string, BlipData>([['w:child', blip('w:child', { content: 'server' })]]);
    expect(overlayLocalBlips(loaded, w, 900)).toBe(false);
    expect(loaded.get('w:child')!.content).toBe('server');
  });

  it('keeps a body this tab saved after the request started (the marker in the parent)', () => {
    const w = createLocalWrites();
    recordSavedBlipContent(w, 'w:parent', '<ul><li><p>L<span data-blip-thread="c"></span></p></li></ul>', 1000);
    const loaded = new Map<string, BlipData>([['w:parent', blip('w:parent', { content: '<ul><li><p>L</p></li></ul>' })]]);
    expect(overlayLocalBlips(loaded, w, 900)).toBe(true);
    expect(loaded.get('w:parent')!.content).toContain('data-blip-thread');
  });

  it('keeps the topic title and content this tab saved after the request started', () => {
    const w = createLocalWrites();
    recordSavedTopic(w, 'T', '<h1>T</h1><ul><li>L<span data-blip-thread="c"></span></li></ul>', 1000);
    const stale = { title: 'T', content: '<h1>T</h1><ul><li>L</li></ul>', other: 1 };
    const r = overlayLocalTopic(stale, w, 900);
    expect(r.applied).toBe(true);
    expect(r.topic.content).toContain('data-blip-thread');
    expect(r.topic.other).toBe(1);
    expect(overlayLocalTopic(stale, w, 1001).applied).toBe(false);
  });

  it('never resurrects a blip the user deleted', () => {
    const w = createLocalWrites();
    recordCreatedBlip(w, blip('w:gone'), 1000);
    recordSavedBlipContent(w, 'w:gone', 'x', 1000);
    forgetBlip(w, 'w:gone');
    const loaded = new Map<string, BlipData>();
    expect(overlayLocalBlips(loaded, w, 900)).toBe(false);
    expect(loaded.size).toBe(0);
  });

  it('forgets writes older than the time-to-live', () => {
    const w = createLocalWrites();
    recordCreatedBlip(w, blip('w:old'), 1000);
    recordSavedTopic(w, 'T', 'c', 1000);
    recordCreatedBlip(w, blip('w:new'), 1000 + LOCAL_WRITE_TTL_MS + 1);
    expect(w.created.has('w:old')).toBe(false);
    expect(w.created.has('w:new')).toBe(true);
    expect(w.topic).toBeNull();
  });
});
