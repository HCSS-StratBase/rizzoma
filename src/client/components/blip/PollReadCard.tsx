// The poll card of the READ view, with voting for anybody who may read the blip (23 Nov 2026).
// Same markup and classes as before (badge, total, question, one row per option with share and bar); the rows are now
// buttons. A vote is posted to /api/blips/:id/polls/:pollKey/vote (one per signed-in person, changeable by choosing
// another option or the same one again to withdraw); the counts shown are the server's, refreshed after every vote.
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { api } from '../../lib/api';

export type PollOptionLike = { id?: string; label?: string; votes?: number };
type PollState = { options: Record<string, number>; mine: string | null; total: number };

export interface PollReadCardProps {
  blipId: string;
  pollKey: string;
  question: string;
  options: PollOptionLike[];
}

const optId = (o: PollOptionLike, i: number) => (o.id != null ? String(o.id) : `opt-${i + 1}`);

export function PollReadCard({ blipId, pollKey, question, options }: PollReadCardProps) {
  const [state, setState] = useState<PollState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!blipId) return;
    let cancelled = false;
    void api<{ polls?: Record<string, PollState> }>(`/api/blips/${encodeURIComponent(blipId)}/polls`).then((r) => {
      const p = r.ok ? (r.data as { polls?: Record<string, PollState> } | undefined)?.polls?.[pollKey] : undefined;
      if (!cancelled && p) setState(p);
    }).catch(() => { /* the stored counts stay on screen */ });
    return () => { cancelled = true; };
  }, [blipId, pollKey]);

  const vote = useCallback(async (optionId: string) => {
    if (busy || !blipId) return;
    setBusy(true); setNote('');
    const next = state?.mine === optionId ? null : optionId; // choosing your own option again withdraws it
    try {
      const r = await api<{ poll?: PollState; error?: string }>(
        `/api/blips/${encodeURIComponent(blipId)}/polls/${encodeURIComponent(pollKey)}/vote`,
        { method: 'POST', body: JSON.stringify({ optionId: next }) },
      );
      if (!alive.current) return;
      const poll = r.ok ? (r.data as { poll?: PollState } | undefined)?.poll : undefined;
      if (poll) setState(poll);
      else if (r.status === 401) setNote('Sign in to vote.');
      else if (r.status === 403) setNote('You may not vote on this poll.');
      else setNote('The vote could not be saved. Try again.');
    } catch {
      if (alive.current) setNote('The vote could not be saved. Try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy, blipId, pollKey, state]);

  const counts = options.map((o, i) => (state ? state.options[optId(o, i)] ?? 0 : Number(o.votes) || 0));
  const total = counts.reduce((n, c) => n + c, 0);
  const mine = state?.mine ?? null;
  const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation(); // a click on the card must not open the blip for editing

  return createElement(
    'figure',
    { className: 'gadget-block gadget-poll gadget-poll-read', 'data-gadget-type': 'poll', 'data-poll-key': pollKey, onClick: stop },
    createElement('div', { className: 'gadget-poll-top' },
      createElement('span', { className: 'gadget-poll-icon', 'aria-hidden': true }, '✓'),
      createElement('div', { className: 'gadget-poll-heading' },
        createElement('span', { className: 'gadget-chip' }, 'Poll'),
        createElement('span', { className: 'gadget-poll-sub' }, 'Collaborative decision point'),
      ),
      createElement('span', { className: 'gadget-poll-total' }, `${total} total ${total === 1 ? 'vote' : 'votes'}`),
    ),
    createElement('div', { className: 'gadget-title gadget-poll-question' }, question),
    createElement('ul', { className: 'gadget-poll-options' }, options.map((o, i) => {
      const id = optId(o, i);
      const votes = counts[i] ?? 0;
      const pct = total ? Math.round((votes / total) * 100) : 0;
      const chosen = mine === id;
      return createElement('li', {
        key: id,
        className: `gadget-poll-option gadget-poll-option-votable${chosen ? ' is-mine' : ''}`,
        role: 'button',
        tabIndex: 0,
        'aria-pressed': chosen,
        'aria-disabled': busy || undefined,
        'data-poll-option': id,
        title: chosen ? 'Your vote (click to withdraw)' : 'Vote for this option',
        onClick: (e: MouseEvent) => { e.stopPropagation(); void vote(id); },
        onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); void vote(id); } },
      },
        createElement('span', { className: 'gadget-poll-label' }, o.label || `Option ${i + 1}`),
        createElement('span', { className: 'gadget-poll-count' }, `${votes} ${votes === 1 ? 'vote' : 'votes'}`),
        createElement('span', { className: 'gadget-poll-pct' }, `${pct}%`),
        createElement('span', { className: 'gadget-poll-bar' }, createElement('span', { className: 'gadget-poll-bar-fill', style: { width: `${pct}%` } })),
      );
    })),
    note ? createElement('div', { className: 'gadget-poll-note', role: 'status' }, note) : null,
  );
}
