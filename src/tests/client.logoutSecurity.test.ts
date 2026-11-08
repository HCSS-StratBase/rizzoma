import { beforeEach, describe, expect, it, vi } from 'vitest';

const logoutMocks = vi.hoisted(() => ({
  api: vi.fn(),
  refreshSocketSession: vi.fn(),
}));

vi.mock('../client/lib/api', () => ({ api: logoutMocks.api }));
vi.mock('../client/lib/socket', () => ({ refreshSocketSession: logoutMocks.refreshSocketSession }));

import { logoutCurrentSession } from '../client/lib/logout';

describe('client durable logout boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not reconnect or claim completion when server revocation fails', async () => {
    logoutMocks.api.mockResolvedValue({
      ok: false,
      status: 503,
      data: { error: 'revocation_failed' },
    });

    await expect(logoutCurrentSession()).rejects.toThrow('revocation_failed');
    expect(logoutMocks.refreshSocketSession).not.toHaveBeenCalled();
  });

  it('re-handshakes the socket only after successful durable revocation', async () => {
    logoutMocks.api.mockResolvedValue({ ok: true, status: 200, data: { ok: true } });

    await expect(logoutCurrentSession()).resolves.toBeUndefined();
    expect(logoutMocks.refreshSocketSession).toHaveBeenCalledTimes(1);
  });
});
