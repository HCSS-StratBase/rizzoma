import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inviteRateLimit, resetInviteRateLimitsForTests } from '../server/middleware/inviteRateLimit';

describe('invite abuse limits', () => {
  beforeEach(() => resetInviteRateLimitsForTests());

  it('limits recipient units per authenticated user and IP', () => {
    const request = {
      body: { emails: Array.from({ length: 20 }, (_, index) => `person-${index}@example.test`) },
      user: { id: 'owner' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as any;
    const response = {
      statusCode: 200,
      body: null as any,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) { this.headers[name] = value; },
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    } as any;
    const next = vi.fn();
    inviteRateLimit(request, response, next);
    inviteRateLimit(request, response, next);
    inviteRateLimit(request, response, next);
    expect(next).toHaveBeenCalledTimes(3);
    inviteRateLimit(request, response, next);
    expect(response.statusCode).toBe(429);
    expect(response.body).toEqual({ error: 'invite_rate_limited' });
    expect(response.headers['Retry-After']).toBeDefined();
  });
});
