import { describe, it, expect } from 'vitest';
import { requireAuth } from '../server/middleware/auth';

describe('requireAuth display name', () => {
  it('falls back to the e-mail, never "Anonymous", for a session without a stored name', () => {
    const req: any = { session: { userId: 'u1', userEmail: 'p@example.com' }, path: '/', method: 'GET' };
    requireAuth(req, { status: () => ({ json: () => undefined }) } as never, () => undefined);
    expect(req.user.name).toBe('p@example.com');
  });
});
