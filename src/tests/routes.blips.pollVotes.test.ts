import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Router } from 'express';
import pollVotesRouter, { extractPolls } from '../server/routes/pollVotes';

// In-memory stand-in for CouchDB: getDoc / insertDoc / updateDoc / find over a Map.
const store = new Map<string, any>();
vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn(async (id: string) => { if (!store.has(id)) throw new Error('404 not_found'); return structuredClone(store.get(id)); }),
  insertDoc: vi.fn(async (doc: any) => { if (store.has(doc._id)) throw new Error('409 conflict'); store.set(doc._id, { ...doc, _rev: '1-a' }); return { ok: true, id: doc._id, rev: '1-a' }; }),
  updateDoc: vi.fn(async (doc: any) => { store.set(doc._id, { ...doc, _rev: '2-b' }); return { ok: true, id: doc._id, rev: '2-b' }; }),
  find: vi.fn(async (sel: any) => ({ docs: [...store.values()].filter((d) => Object.entries(sel).every(([k, v]) => d[k] === v)) })),
  findOne: vi.fn().mockResolvedValue(null),
  getDocsById: vi.fn().mockResolvedValue({}),
  deleteDoc: vi.fn(),
}));

const POLL = '<ul><li><p>x</p><figure data-gadget-type="poll" data-poll-question="Q" data-poll-options="[{&quot;id&quot;:&quot;a&quot;,&quot;label&quot;:&quot;Yes&quot;,&quot;votes&quot;:2},{&quot;id&quot;:&quot;b&quot;,&quot;label&quot;:&quot;No&quot;,&quot;votes&quot;:0}]"></figure></li></ul>';

async function invoke(method: string, path: string, opts: { params?: any; body?: any; session?: any } = {}) {
  const layer = (pollVotesRouter as Router as any).stack.find((e: any) => e.route?.path === path && e.route?.methods?.[method]);
  if (!layer) throw new Error(`no route ${method} ${path}`);
  const req: any = { method, params: opts.params ?? {}, body: opts.body ?? {}, session: opts.session ?? {}, headers: { 'x-csrf-token': 'tok' }, get(n: string) { return this.headers[n.toLowerCase()]; } };
  const res: any = { statusCode: 200, body: undefined, headers: {} as any, status(c: number) { this.statusCode = c; return this; }, json(p: unknown) { this.body = p; return this; }, send(p: unknown) { this.body = p; return this; }, setHeader() { return this; }, set() { return this; } };
  for (const entry of layer.route.stack) { let next = false; await entry.handle(req, res, () => { next = true; }); if (!next) break; }
  return res;
}
const asUser = (id: string) => ({ userId: id, userEmail: `${id}@x.org`, userName: id, csrfToken: 'tok' });

describe('poll votes by readers', () => {
  beforeEach(() => {
    store.clear();
    store.set('w1', { _id: 'w1', type: 'topic', authorId: 'owner', shareLevel: 'private' });
    store.set('b1', { _id: 'b1', type: 'blip', waveId: 'w1', authorId: 'owner', content: POLL });
    store.set('part:1', { _id: 'part:1', type: 'participant', waveId: 'w1', userId: 'reader', email: 'reader@x.org', role: 'viewer', status: 'active' });
  });

  it('extracts polls in document order with stored counts', () => {
    expect(extractPolls(POLL)).toEqual([{ pollKey: 'p0', options: [{ id: 'a', votes: 2 }, { id: 'b', votes: 0 }] }]);
    expect(extractPolls('<p>none</p>')).toEqual([]);
    expect(extractPolls(POLL + POLL).map((p) => p.pollKey)).toEqual(['p0', 'p1']);
  });

  it('a read-only participant can vote, change the vote, and the count follows', async () => {
    const v1 = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: 'b' }, session: asUser('reader') });
    expect(v1.statusCode).toBe(200);
    expect(v1.body.poll).toEqual({ options: { a: 2, b: 1 }, mine: 'b', total: 3 });
    const v2 = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: 'a' }, session: asUser('reader') });
    expect(v2.body.poll).toEqual({ options: { a: 3, b: 0 }, mine: 'a', total: 3 });
    expect([...store.keys()].filter((k) => k.startsWith('poll_vote:'))).toEqual(['poll_vote:b1:p0:reader']);
    // the blip itself is never written
    expect(store.get('b1').content).toBe(POLL);
  });

  it('one vote per person: two people count twice, withdrawing removes only one', async () => {
    store.set('part:2', { _id: 'part:2', type: 'participant', waveId: 'w1', userId: 'other', email: 'other@x.org', role: 'viewer', status: 'active' });
    await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: 'a' }, session: asUser('reader') });
    await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: 'a' }, session: asUser('other') });
    const g = await invoke('get', '/:id/polls', { params: { id: 'b1' }, session: asUser('reader') });
    expect(g.body.polls.p0).toEqual({ options: { a: 4, b: 0 }, mine: 'a', total: 4 });
    const w = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: null }, session: asUser('reader') });
    expect(w.body.poll).toEqual({ options: { a: 3, b: 0 }, mine: null, total: 3 });
  });

  it('refuses an outsider, an anonymous caller, an unknown option, and an unknown poll', async () => {
    const out = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: 'a' }, session: asUser('stranger') });
    expect(out.statusCode).toBe(403);
    const anon = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: 'a' }, session: {} });
    expect(anon.statusCode).toBe(401);
    const badOpt = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: 'zzz' }, session: asUser('reader') });
    expect(badOpt.statusCode).toBe(400);
    const badPoll = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p7' }, body: { optionId: 'a' }, session: asUser('reader') });
    expect(badPoll.statusCode).toBe(404);
    const badKey = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: '../x' }, body: { optionId: 'a' }, session: asUser('reader') });
    expect(badKey.statusCode).toBe(400);
    expect([...store.keys()].some((k) => k.startsWith('poll_vote:'))).toBe(false);
    const g = await invoke('get', '/:id/polls', { params: { id: 'b1' }, session: asUser('stranger') });
    expect(g.statusCode).toBe(403);
  });
});

describe('poll votes: csrf', () => {
  it('refuses a vote whose csrf token does not match the session', async () => {
    store.clear();
    store.set('w1', { _id: 'w1', type: 'topic', authorId: 'owner', shareLevel: 'private' });
    store.set('b1', { _id: 'b1', type: 'blip', waveId: 'w1', authorId: 'owner', content: POLL });
    const res = await invoke('post', '/:id/polls/:pollKey/vote', { params: { id: 'b1', pollKey: 'p0' }, body: { optionId: 'a' }, session: { ...asUser('owner'), csrfToken: 'different' } });
    expect(res.statusCode).toBe(403);
    expect([...store.keys()].some((k) => k.startsWith('poll_vote:'))).toBe(false);
  });
});
