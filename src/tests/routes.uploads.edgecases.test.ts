import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Router, Request, Response, NextFunction } from 'express';
import { uploadsRouter } from '../server/routes/uploads';

// Mock multer so we don't depend on multipart parsing or real disk I/O
vi.mock('multer', () => {
  class MulterError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
      this.name = 'MulterError';
    }
  }

  const multer = ((_: any) => ({
    single: (_field: string) =>
      (req: Request, _res: Response, next: NextFunction) => {
        // No-op: leave req.file as-is for tests.
        next();
      },
  })) as any;

  multer.diskStorage = () => ({});
  multer.MulterError = MulterError;

  return {
    __esModule: true,
    default: multer,
    MulterError,
  };
});

type InvokeOptions = {
  session?: Record<string, unknown>;
  file?: { originalname: string; mimetype: string; size: number; filename?: string };
};

async function invokeUploads(
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
    session: Record<string, unknown>;
    file?: { originalname: string; mimetype: string; size: number; filename?: string };
  } = {
    method: method.toUpperCase() as any,
    session: opts.session ?? {},
    file: opts.file,
  };
  const res: Partial<Response> & {
    statusCode: number;
    body: any;
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this as any;
    },
    json(payload: any) {
      this.body = payload;
      return this as any;
    },
  };
  const next: NextFunction = (err?: any) => {
    if (err) throw err;
  };

  for (const entry of stack) {
    let nextCalled = false;
    await (entry.handle as any)(req as Request, res as Response, (err?: any) => {
      nextCalled = true;
      if (err) throw err;
    });
    if (!nextCalled) break;
  }

  return res;
}

describe('routes: /api/uploads edgecases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects upload when unauthenticated', async () => {
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: {},
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Authentication required' });
  });

  it('returns 400 when authenticated but no file is present', async () => {
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: { userId: 'u1', userEmail: 'u1@example.com', userName: 'User One' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'missing_file' });
  });

  it('returns upload metadata when authenticated and file is present', async () => {
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: { userId: 'u1', userEmail: 'u1@example.com', userName: 'User One' },
      file: {
        originalname: 'demo.pdf',
        mimetype: 'application/pdf',
        size: 1234,
        filename: 'demo-1234.pdf',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body?.upload).toBeTruthy();
    expect(res.body.upload.originalName).toBe('demo.pdf');
    expect(res.body.upload.mimeType).toBe('application/pdf');
    expect(res.body.upload.size).toBe(1234);
    expect(res.body.upload.url).toBe('/uploads/demo-1234.pdf');
  });
});
