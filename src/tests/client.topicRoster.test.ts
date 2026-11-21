import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => vi.fn());
vi.mock('../client/lib/api', () => ({ api }));
import { fetchTopicRoster, clearTopicRosterCache } from '../client/lib/topicRoster';
import { buildEditorRoster } from '../client/components/editor/EditorConfig';

describe('topic roster for @mention and ~task', () => {
  beforeEach(() => { api.mockReset(); clearTopicRosterCache(); });

  it('offers accepted topic participants, not pending or declined ones', async () => {
    api.mockResolvedValue({ ok: true, status: 200, data: { participants: [
      { userId: 'u1', name: 'One', email: 'one@example.com', status: 'accepted' },
      { userId: 'u2', email: 'two@example.com', status: 'pending' },
      { userId: 'u3', email: 'three@example.com', status: 'declined' },
    ] } });
    const roster = await fetchTopicRoster('w1');
    expect(roster).toEqual([{ id: 'u1', label: 'One', email: 'one@example.com' }]);
  });

  it('reads the participants array at call time, so people who arrive after the editor was built are offered', () => {
    const participants: Array<{ id: string; label: string }> = [];
    const options = { participants } as never;
    expect(buildEditorRoster(options)).toHaveLength(0);
    participants.push({ id: 'late', label: 'Late arrival' });
    expect(buildEditorRoster(options).map((p) => p.id)).toEqual(['late']);
  });
});
