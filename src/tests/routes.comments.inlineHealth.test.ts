import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Router, Request, Response } from 'express';
import type { Session, SessionData } from 'express-session';
import { inlineCommentsRouter } from '../server/routes/inlineComments';
import { FEATURES } from '@shared/featureFlags';

vi.mock('../server/lib/couch.js', () => ({
  view: vi.fn().mockResolvedValue({ rows: [] }),
  find: vi.fn().mockResolvedValue({ docs: [] }),
  insertDoc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

type InvokeOptions = {
  params?: Record<string, string>;
  body?: any;
  session?: Session & Partial<SessionData> & Record<string, unknown>;
  user?: any;
};

async function invokeInlineRoute(
  router: Router,
  method: string,
  path: string,
  opts: InvokeOptions = {},
) {
  const layer = (router as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method.toLowerCase()],
  );
  if (!layer) throw new Error(`Route ${method} ${path} not found`);
  const stack = layer.route.stack;
  const req: Partial<Request> & {
    session: Session & Partial<SessionData> & Record<string, unknown>;
    user?: any;
  } = {
    method: method.toUpperCase() as any,
    params: opts.params ?? {},
    body: opts.body ?? {},
    session: (opts.session ?? {}) as Session & Partial<SessionData> & Record<string, unknown>,
    user: opts.user,
  };
  const res: Partial<Response> & {
    statusCode: number;
    body: any;
    headers: Record<string, unknown>;
  } = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this as any;
    },
    json(payload: any) {
      this.body = payload;
      return this as any;
    },
    setHeader(name: string, value: unknown) {
      (this.headers as Record<string, unknown>)[name.toLowerCase()] = value;
      return this as any;
    },
    getHeader(name: string) {
      return (this.headers as Record<string, unknown>)[name.toLowerCase()] as string | number | string[] | undefined;
    },
  };
  for (const entry of stack) {
    let nextCalled = false;
    await (entry.handle as any)(req, res, (err?: any) => {
      nextCalled = true;
      if (err) throw err;
    });
    if (!nextCalled) break;
  }
  return res;
}

describe('routes: inline comments basic health', () => {
  beforeEach(() => {
    (FEATURES as any).INLINE_COMMENTS = true;
  });

  it('returns empty comments list for a blip when view has no rows', async () => {
    const res = await invokeInlineRoute(inlineCommentsRouter as unknown as Router, 'get', '/blip/:blipId/comments', {
      params: { blipId: 'b1' },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body?.comments)).toBe(true);
    expect(res.body.comments.length).toBe(0);
  });

  it('returns 404 when inline comments feature is disabled', async () => {
    (FEATURES as any).INLINE_COMMENTS = false;
    const res = await invokeInlineRoute(inlineCommentsRouter as unknown as Router, 'get', '/blip/:blipId/comments', {
      params: { blipId: 'b1' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: 'Feature not enabled' });
  });
});
