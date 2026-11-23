// Reader votes on poll gadgets (23 Nov 2026, Hryhorii's report).
//
// A poll gadget stores its option counts INSIDE the blip HTML (`data-poll-options`), so voting through the blip is a
// write of the blip: only someone who may edit can vote, only in the editor, and there is no record of who voted what.
// This route records one vote per signed-in person per poll in its own document, with permission = anybody who may
// READ the blip. The shown count of an option is the count stored in the blip (votes cast through the editor before
// this existed, kept as they are) plus the recorded votes. The blip itself is never written here.
//
// Poll identity: `p<n>` = the n-th poll figure in the blip's saved HTML (0-based). A poll has no id of its own in the
// stored format; if a poll is deleted or reordered, votes recorded for its old position stay in the database and
// are shown on whichever poll takes that position (known limit, same family as any positional key).
import { Router } from 'express';
import { parseFragment } from 'parse5';
import { find, getDoc, insertDoc, updateDoc } from '../lib/couch.js';
import { requireAuth } from '../middleware/auth.js';
import { noStore } from '../middleware/noStore.js';
import { csrfProtect } from '../middleware/csrf.js';
import { identityFromRequest, requireWaveAccess } from '../lib/access.js';

const router = Router();

// A poll sits in a reply (blip) or in the topic body (the root, addressed by the topic id).
export type PollVoteDoc = {
  _id: string;
  _rev?: string;
  type: 'poll_vote';
  blipId: string;
  waveId: string;
  pollKey: string;
  userId: string;
  optionId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type StoredPoll = { pollKey: string; options: Array<{ id: string; votes: number }> };

const POLL_KEY_RE = /^p\d{1,3}$/;

export const pollVoteDocId = (blipId: string, pollKey: string, userId: string) => `poll_vote:${blipId}:${pollKey}:${userId}`;

/** The polls of a saved blip, in document order, with the option ids and the counts stored in the blip. */
export function extractPolls(html: string): StoredPoll[] {
  const out: StoredPoll[] = [];
  const walk = (node: any): void => {
    if (!node) return;
    if (node.nodeName === 'figure' && Array.isArray(node.attrs)) {
      const attr = (n: string) => node.attrs.find((a: { name: string; value: string }) => a.name === n)?.value;
      if (attr('data-gadget-type') === 'poll') {
        let raw: unknown = [];
        try { raw = JSON.parse(attr('data-poll-options') || '[]'); } catch { raw = []; }
        const list = Array.isArray(raw) ? raw : [];
        const options = list.map((o: any, i: number) => ({
          id: typeof o === 'object' && o && o.id != null ? String(o.id) : `opt-${i + 1}`,
          votes: typeof o === 'object' && o && Number.isFinite(Number(o.votes)) ? Number(o.votes) : 0,
        }));
        out.push({ pollKey: `p${out.length}`, options });
        return;
      }
    }
    const kids = node.childNodes || node.content?.childNodes;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  walk(parseFragment(html || ''));
  return out;
}

async function loadReadableBlip(req: any, res: any, blipId: string) {
  let doc: any;
  try {
    doc = await getDoc<any>(blipId);
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: req?.id }); return null; }
    throw e;
  }
  // The topic body is a synthetic root blip whose id is the topic id (same as RizzomaBlip, which reports its own id).
  if (doc?.type === 'topic' && typeof doc._id === 'string') doc = { ...doc, waveId: doc._id };
  else if (!doc || doc.type !== 'blip' || typeof doc.waveId !== 'string' || !doc.waveId) {
    res.status(404).json({ error: 'not_found', requestId: req?.id });
    return null;
  }
  if (doc.deleted) { res.status(410).json({ error: 'deleted', requestId: req?.id }); return null; }
  const access = await requireWaveAccess(req, res, doc.waveId, 'read');
  if (!access) return null;
  return doc;
}

async function tally(blipId: string, userId: string | undefined) {
  const r = await find<PollVoteDoc>({ type: 'poll_vote', blipId }, { limit: 10000 });
  const counts: Record<string, Record<string, number>> = {};
  const mine: Record<string, string | null> = {};
  for (const v of r.docs || []) {
    if (!v.optionId) continue;
    (counts[v.pollKey] ||= {})[v.optionId] = (counts[v.pollKey]?.[v.optionId] || 0) + 1;
    if (userId && v.userId === userId) mine[v.pollKey] = v.optionId;
  }
  return { counts, mine };
}

function shape(polls: StoredPoll[], t: Awaited<ReturnType<typeof tally>>) {
  const out: Record<string, { options: Record<string, number>; mine: string | null; total: number }> = {};
  for (const p of polls) {
    const options: Record<string, number> = {};
    let total = 0;
    for (const o of p.options) {
      const n = o.votes + (t.counts[p.pollKey]?.[o.id] || 0);
      options[o.id] = n; total += n;
    }
    out[p.pollKey] = { options, mine: t.mine[p.pollKey] ?? null, total };
  }
  return out;
}

// Live counts of every poll in the blip and this person's own choice. Anyone who may read the blip.
router.get('/:id/polls', noStore, async (req, res): Promise<void> => {
  try {
    const doc = await loadReadableBlip(req, res, req.params['id'] as string);
    if (!doc) return;
    const t = await tally(doc._id, identityFromRequest(req).id);
    res.json({ polls: shape(extractPolls(doc.content || ''), t) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'poll_votes_error', requestId: (req as any)?.id });
  }
});

// Record, change or withdraw (optionId null) the signed-in person's vote. One vote per person per poll.
router.post('/:id/polls/:pollKey/vote', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const pollKey = String(req.params['pollKey'] || '');
    const optionId = req.body?.optionId;
    if (!POLL_KEY_RE.test(pollKey)) { res.status(400).json({ error: 'invalid_poll', requestId: (req as any)?.id }); return; }
    if (optionId !== null && (typeof optionId !== 'string' || !optionId || optionId.length > 200)) {
      res.status(400).json({ error: 'invalid_option', requestId: (req as any)?.id }); return;
    }
    const doc = await loadReadableBlip(req, res, req.params['id'] as string);
    if (!doc) return;
    const polls = extractPolls(doc.content || '');
    const poll = polls.find((p) => p.pollKey === pollKey);
    if (!poll) { res.status(404).json({ error: 'poll_not_found', requestId: (req as any)?.id }); return; }
    if (optionId !== null && !poll.options.some((o) => o.id === optionId)) {
      res.status(400).json({ error: 'invalid_option', requestId: (req as any)?.id }); return;
    }
    const _id = pollVoteDocId(doc._id, pollKey, userId);
    const now = Date.now();
    const write = async (): Promise<void> => {
      let existing: PollVoteDoc | null = null;
      try { existing = await getDoc<PollVoteDoc>(_id); } catch (e: any) { if (!String(e?.message).startsWith('404')) throw e; }
      if (existing) await updateDoc({ ...existing, optionId, waveId: doc.waveId, updatedAt: now });
      else await insertDoc<PollVoteDoc>({ _id, type: 'poll_vote', blipId: doc._id, waveId: doc.waveId, pollKey, userId, optionId, createdAt: now, updatedAt: now });
    };
    try { await write(); } catch (e: any) {
      // two quick clicks race for the same document: one retry on a revision conflict is enough
      if (String(e?.message).startsWith('409')) await write(); else throw e;
    }
    const t = await tally(doc._id, userId);
    res.json({ ok: true, poll: shape(polls, t)[pollKey] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'poll_vote_error', requestId: (req as any)?.id });
  }
});

export default router;
