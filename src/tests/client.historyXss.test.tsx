import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../client/lib/api', () => ({ api: apiMock }));

import { BlipHistoryModal } from '../client/components/blip/BlipHistoryModal';
import { WavePlaybackModal } from '../client/components/WavePlaybackModal';

const hostile = '<p onclick="pwn()">History <img src="x" onerror="pwn()"><a href="javascript:pwn()">link</a><script>pwn()</script></p>';
const entry = {
  id: 'history-1',
  blipId: 'blip-1',
  content: hostile,
  event: 'create',
  createdAt: 1,
  snapshotVersion: 1,
};

describe('history playback XSS boundary', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    apiMock.mockResolvedValue({ ok: true, status: 200, data: { history: [entry] } });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  const waitFor = async (selector: string) => {
    for (let attempt = 0; attempt < 20 && !host.querySelector(selector); attempt += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    }
    return host.querySelector(selector) as HTMLElement | null;
  };

  it('sanitizes direct blip-history rendering', async () => {
    await act(async () => root.render(<BlipHistoryModal blipId="blip-1" onClose={() => undefined} />));
    const content = await waitFor('.blip-history-content');
    expect(content).not.toBeNull();
    expect(content!.textContent).toContain('History');
    expect(content!.innerHTML).not.toMatch(/script|onclick|onerror|javascript:/i);
  });

  it('sanitizes wave playback and overview extraction', async () => {
    await act(async () => root.render(
      <WavePlaybackModal waveId="wave-1" topicTitle="Topic" blips={[{ id: 'blip-1', label: 'Blip' }]} onClose={() => undefined} />,
    ));
    const content = await waitFor('.wave-playback-content');
    expect(content).not.toBeNull();
    expect(content!.innerHTML).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(host.querySelector('.wave-overview-blip-content')?.textContent).toContain('History');
  });
});
