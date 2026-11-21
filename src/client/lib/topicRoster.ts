import { api } from './api';

export type RosterPerson = { id: string; label: string; email?: string };

const cache = new Map<string, { at: number; people: RosterPerson[] }>();
const inflight = new Map<string, Promise<RosterPerson[]>>();
const TTL_MS = 60_000;

/** Accepted participants of a topic, for the @mention and ~task pickers. The pickers used to list only people who had already written in
 *  the blip, so a collaborator who had not yet contributed could not be mentioned or assigned (found on production, 21 Nov 2026). */
export async function fetchTopicRoster(waveId: string): Promise<RosterPerson[]> {
  const hit = cache.get(waveId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.people;
  const running = inflight.get(waveId);
  if (running) return running;
  const p = (async () => {
    try {
      const r = await api<{ participants?: Array<{ userId?: string; id?: string; name?: string; email?: string; status?: string }> }>(`/api/waves/${encodeURIComponent(waveId)}/participants`);
      const list = (r.ok && r.data && typeof r.data === 'object' ? (r.data as { participants?: unknown[] }).participants : []) as Array<{ userId?: string; id?: string; name?: string; email?: string; status?: string }>;
      const people = (list || [])
        .filter((x) => x.status === 'accepted' && (x.userId || x.id))
        .map((x) => ({ id: String(x.userId || x.id), label: x.name || x.email || String(x.userId || x.id), email: x.email }));
      cache.set(waveId, { at: Date.now(), people });
      return people;
    } catch {
      return [];
    } finally {
      inflight.delete(waveId);
    }
  })();
  inflight.set(waveId, p);
  return p;
}

export function clearTopicRosterCache(): void { cache.clear(); }
