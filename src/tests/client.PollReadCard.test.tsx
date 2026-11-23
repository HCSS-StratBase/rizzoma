// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('../client/lib/api', () => ({ api: apiMock }));

import { PollReadCard } from '../client/components/blip/PollReadCard';

const options = [{ id: 'a', label: 'Yes', votes: 2 }, { id: 'b', label: 'No', votes: 0 }];

describe('PollReadCard: a reader votes in view mode', () => {
  let container: HTMLDivElement; let root: Root;
  beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => { apiMock.mockReset(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const mount = async () => { await act(async () => { root.render(<PollReadCard blipId="b1" pollKey="p0" question="Lunch?" options={options} />); }); };

  it('shows the live counts, posts a vote, updates the percentages and marks the reader\'s choice', async () => {
    apiMock.mockResolvedValueOnce({ ok: true, status: 200, data: { polls: { p0: { options: { a: 2, b: 0 }, mine: null, total: 2 } } } });
    await mount();
    expect(container.textContent).toContain('2 total votes');
    apiMock.mockResolvedValueOnce({ ok: true, status: 200, data: { poll: { options: { a: 2, b: 1 }, mine: 'b', total: 3 } } });
    const no = container.querySelector('[data-poll-option="b"]') as HTMLElement;
    await act(async () => { no.click(); });
    const call = apiMock.mock.calls[1];
    expect(call[0]).toBe('/api/blips/b1/polls/p0/vote');
    expect(JSON.parse(call[1].body)).toEqual({ optionId: 'b' });
    expect(container.textContent).toContain('3 total votes');
    expect(container.querySelector('[data-poll-option="b"]')!.className).toContain('is-mine');
    expect(container.querySelector('[data-poll-option="b"] .gadget-poll-pct')!.textContent).toBe('33%');
    // choosing the same option again withdraws
    apiMock.mockResolvedValueOnce({ ok: true, status: 200, data: { poll: { options: { a: 2, b: 0 }, mine: null, total: 2 } } });
    await act(async () => { (container.querySelector('[data-poll-option="b"]') as HTMLElement).click(); });
    expect(JSON.parse(apiMock.mock.calls[2][1].body)).toEqual({ optionId: null });
    expect(container.querySelector('[data-poll-option="b"]')!.className).not.toContain('is-mine');
  });

  it('a click on the card does not bubble (it must not open the blip for editing) and an error is said plainly', async () => {
    apiMock.mockResolvedValueOnce({ ok: true, status: 200, data: { polls: {} } });
    const outer = vi.fn(); container.addEventListener('click', outer);
    await mount();
    apiMock.mockResolvedValueOnce({ ok: false, status: 401, data: {} });
    await act(async () => { (container.querySelector('[data-poll-option="a"]') as HTMLElement).click(); });
    expect(container.textContent).toContain('Sign in to vote.');
    expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ defaultPrevented: true }));
  });
});
