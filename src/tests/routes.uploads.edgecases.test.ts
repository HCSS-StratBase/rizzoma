import fs from 'fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Router, Request, Response, NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import { scanBuffer } from '../server/lib/virusScan';
const scanBufferMock = scanBuffer as unknown as ReturnType<typeof vi.fn>;

const uploadMock = vi.fn(() => ({
  promise: async () => {},
}));
const signedUrlMock = vi.fn(() => 'https://s3.example.com/object');

vi.mock('../server/lib/virusScan', () => ({
  scanBuffer: vi.fn(async () => {}),
}));

vi.mock('aws-sdk', () => {
  class S3 {
    upload = uploadMock;
    getSignedUrl = signedUrlMock;
  }
  return {
    __esModule: true,
    default: { S3 },
    S3,
  };
});

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
      (_req: Request, _res: Response, next: NextFunction) => {
        // No-op: leave req.file as-is for tests.
        next();
      },
  })) as any;

  multer.diskStorage = () => ({});
  multer.memoryStorage = () => ({});
  multer.MulterError = MulterError;

  return {
    __esModule: true,
    default: multer,
    MulterError,
  };
});

type InvokeOptions = {
  session?: Session & Partial<SessionData> & Record<string, unknown>;
  file?: {
    fieldname?: string;
    originalname: string;
    encoding?: string;
    mimetype: string;
    size: number;
    destination?: string;
    filename?: string;
    path?: string;
    buffer?: Buffer;
    stream?: unknown;
  };
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
    session: Session & Partial<SessionData> & Record<string, unknown>;
    file?: {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
      buffer: Buffer;
      stream: unknown;
    };
  } = {
    method: method.toUpperCase() as any,
    session: (opts.session ?? makeSession()) as Session & Partial<SessionData> & Record<string, unknown>,
    file: opts.file
      ? {
          fieldname: 'file',
          originalname: opts.file.originalname,
          encoding: opts.file.encoding ?? '7bit',
          mimetype: opts.file.mimetype,
          size: opts.file.size,
          destination: opts.file.destination ?? '',
          filename: opts.file.filename ?? '',
          path: opts.file.path ?? '',
          buffer: opts.file.buffer ?? Buffer.alloc(0),
          stream: opts.file.stream ?? ({} as any),
        }
      : undefined,
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

const baseEnv = { ...process.env };

const makeSession = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'sess-1',
    cookie: { resetMaxAge: vi.fn() } as any,
    regenerate: vi.fn(),
    destroy: vi.fn(),
    reload: vi.fn(),
    save: vi.fn(),
    touch: vi.fn(),
    ...overrides,
  }) as unknown as Session & Partial<SessionData> & Record<string, unknown>;

async function loadUploadsRouter(env: Record<string, string | undefined> = {}) {
  Object.assign(process.env, baseEnv, env);
  const module = await import('../server/routes/uploads');
  return module.uploadsRouter as unknown as Router;
}

describe('routes: /api/uploads edgecases', () => {
  let writeFileSpy: any;

  // Increase timeout for module loading with mocks
  vi.setConfig({ testTimeout: 15000 });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.assign(process.env, baseEnv, {
      UPLOADS_STORAGE: 'local',
      UPLOADS_S3_BUCKET: 'test-bucket',
      UPLOADS_S3_PUBLIC_URL: '',
      UPLOADS_S3_SIGNED_URL_TTL: '3600',
    });
    scanBufferMock.mockResolvedValue(undefined);
    writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    writeFileSpy.mockRestore();
    Object.assign(process.env, baseEnv);
  });

  it('rejects upload when unauthenticated', async () => {
    const uploadsRouter = await loadUploadsRouter();
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: makeSession(),
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Authentication required' });
  });

  it('returns 400 when authenticated but no file is present', async () => {
    const uploadsRouter = await loadUploadsRouter();
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: makeSession({ userId: 'u1', userEmail: 'u1@example.com', userName: 'User One' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'missing_file' });
  });

  it('returns upload metadata when authenticated and file is present', async () => {
    const uploadsRouter = await loadUploadsRouter();
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: makeSession({ userId: 'u1', userEmail: 'u1@example.com', userName: 'User One' }),
      file: {
        originalname: 'demo.pdf',
        mimetype: 'application/pdf',
        size: 1234,
        buffer: Buffer.from('%PDF-1.4 sample'),
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.body?.upload).toBeTruthy();
    expect(res.body.upload.originalName).toBe('demo.pdf');
    expect(res.body.upload.mimeType).toBe('application/pdf');
    expect(res.body.upload.size).toBe(1234);
    expect(res.body.upload.url).toMatch(/\/uploads\//);
    expect(writeFileSpy).toHaveBeenCalled();
  });

  it('rejects disallowed MIME types', async () => {
    const uploadsRouter = await loadUploadsRouter();
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: makeSession({ userId: 'u1' }),
      file: {
        originalname: 'malware.exe',
        mimetype: 'application/x-msdownload',
        size: 2048,
        buffer: Buffer.from('MZ\x00\x00'),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_file_type' });
  });

  it('rejects uploads when virus scan fails', async () => {
    const uploadsRouter = await loadUploadsRouter();
    scanBufferMock.mockRejectedValueOnce(new Error('FOUND'));
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: makeSession({ userId: 'u1' }),
      file: {
        originalname: 'demo.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('%PDF'),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'virus_detected' });
  });

  it('persists uploads to S3 when configured', async () => {
    const uploadsRouter = await loadUploadsRouter({ UPLOADS_STORAGE: 's3' });
    const res = await invokeUploads(uploadsRouter as unknown as Router, 'post', '/', {
      session: makeSession({ userId: 'u1' }),
      file: {
        originalname: 'demo.pdf',
        mimetype: 'application/pdf',
        size: 512,
        buffer: Buffer.from('%PDF'),
      },
    });
    expect(uploadMock).toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body.upload.url).toBe('https://s3.example.com/object');
    expect(writeFileSpy).not.toHaveBeenCalled();
  });
});
