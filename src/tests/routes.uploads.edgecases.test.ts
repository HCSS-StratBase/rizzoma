import fs from 'fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Router, Request, Response, NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import { scanBuffer } from '../server/lib/virusScan';
import { find, getDoc, insertDoc } from '../server/lib/couch';

const scanBufferMock = scanBuffer as unknown as ReturnType<typeof vi.fn>;
const findMock = find as unknown as ReturnType<typeof vi.fn>;
const getDocMock = getDoc as unknown as ReturnType<typeof vi.fn>;
const insertDocMock = insertDoc as unknown as ReturnType<typeof vi.fn>;

vi.mock('../server/lib/virusScan', () => ({
  scanBuffer: vi.fn(async () => {}),
}));

vi.mock('../server/lib/couch', () => ({
  find: vi.fn(async () => ({ docs: [] })),
  getDoc: vi.fn(),
  insertDoc: vi.fn(async (doc: any) => ({ ok: true, id: doc._id, rev: '1-test' })),
}));

// Mock multer so we don't depend on multipart parsing or real disk I/O.
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
  body?: Record<string, unknown>;
  params?: Record<string, string>;
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
    path,
    body: opts.body || {},
    params: opts.params || {},
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
    headers: Record<string, string>;
    sentFile?: { filePath: string; options: Record<string, unknown> };
  } = {
    statusCode: 200,
    body: undefined,
    headers: {},
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this as any;
    },
    json(payload: any) {
      this.body = payload;
      return this as any;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers[name.toLowerCase()] = String(value);
      return this as any;
    },
    sendFile(filePath: string, options?: any, callback?: (error?: Error) => void) {
      this.sentFile = { filePath, options: options || {} };
      callback?.();
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

const pdfFile = () => ({
  originalname: 'demo.pdf',
  mimetype: 'application/pdf',
  size: 15,
  buffer: Buffer.from('%PDF-1.4 sample'),
});

const privateWave = {
  _id: 'wave-1',
  type: 'wave',
  authorId: 'owner-1',
  shareLevel: 'private',
  allowComments: false,
  allowEdits: false,
};

const blip = {
  _id: 'blip-1',
  type: 'blip',
  waveId: 'wave-1',
};

const uploadDoc = {
  _id: 'upload:known',
  type: 'upload',
  waveId: 'wave-1',
  blipId: 'blip-1',
  uploaderId: 'owner-1',
  storage: 'local',
  storageKey: 'known.pdf',
  originalName: 'private report.pdf',
  mimeType: 'application/pdf',
  size: 42,
  createdAt: 1,
};

async function loadUploadsModule(env: Record<string, string | undefined> = {}) {
  Object.assign(process.env, baseEnv, env);
  return import('../server/routes/uploads');
}

describe('routes: access-controlled uploads', () => {
  let writeFileSpy: ReturnType<typeof vi.spyOn>;
  let unlinkSpy: ReturnType<typeof vi.spyOn>;

  vi.setConfig({ testTimeout: 30000 });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    Object.assign(process.env, baseEnv, { UPLOADS_STORAGE: 'local' });
    scanBufferMock.mockResolvedValue(undefined);
    findMock.mockResolvedValue({ docs: [] });
    getDocMock.mockImplementation(async (id: string) => {
      if (id === blip._id) return blip;
      if (id === privateWave._id) return privateWave;
      if (id === uploadDoc._id) return uploadDoc;
      throw new Error('404 not_found');
    });
    insertDocMock.mockImplementation(async (doc: any) => ({ ok: true, id: doc._id, rev: '1-test' }));
    writeFileSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as never);
    unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    writeFileSpy.mockRestore();
    unlinkSpy.mockRestore();
    Object.assign(process.env, baseEnv);
  });

  it('rejects upload when unauthenticated', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      body: { blipId: blip._id },
      file: pdfFile(),
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'Authentication required' });
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when authenticated but no file is present', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'owner-1' }),
      body: { blipId: blip._id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'missing_file' });
  });

  it('requires a canonical blip id', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'owner-1' }),
      file: pdfFile(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'missing_blip_id' });
  });

  it('persists opaque metadata bound to the server-resolved wave', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'owner-1', userEmail: 'owner@example.com' }),
      body: { blipId: blip._id },
      file: pdfFile(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.upload).toMatchObject({
      originalName: 'demo.pdf',
      mimeType: 'application/pdf',
      size: 15,
    });
    expect(res.body.upload.id).toMatch(/^upload:[0-9a-f-]{36}$/);
    expect(res.body.upload.url).toMatch(/^\/uploads\/upload%3A[0-9a-f-]{36}$/);
    expect(insertDocMock).toHaveBeenCalledWith(expect.objectContaining({
      _id: res.body.upload.id,
      type: 'upload',
      waveId: privateWave._id,
      blipId: blip._id,
      uploaderId: 'owner-1',
      storage: 'local',
      originalName: 'demo.pdf',
    }));
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.stringMatching(/[0-9a-f-]{36}\.pdf$/),
      expect.any(Buffer),
      { flag: 'wx', mode: 0o600 },
    );
  });

  it('rejects a non-editor and does not persist bytes', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'outsider-1' }),
      body: { blipId: blip._id },
      file: pdfFile(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'forbidden', permission: 'edit' });
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(insertDocMock).not.toHaveBeenCalled();
  });

  it('rejects a client wave claim that disagrees with the blip record', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'owner-1' }),
      body: { blipId: blip._id, waveId: 'attacker-wave' },
      file: pdfFile(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'wave_mismatch' });
    expect(writeFileSpy).not.toHaveBeenCalled();
  });

  it('rejects disallowed MIME types', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'owner-1' }),
      body: { blipId: blip._id },
      file: {
        originalname: 'malware.exe',
        mimetype: 'application/x-msdownload',
        size: 4,
        buffer: Buffer.from('MZ\x00\x00'),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_file_type' });
  });

  it('rejects uploads when virus scan fails', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    scanBufferMock.mockRejectedValueOnce(new Error('FOUND'));
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'owner-1' }),
      body: { blipId: blip._id },
      file: pdfFile(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'virus_detected' });
  });

  it('fails S3 closed because public and signed URLs outlive revocation', async () => {
    const { uploadsRouter } = await loadUploadsModule({ UPLOADS_STORAGE: 's3' });
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'owner-1' }),
      body: { blipId: blip._id },
      file: pdfFile(),
    });
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'upload_storage_acl_unavailable' });
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(insertDocMock).not.toHaveBeenCalled();
  });

  it('removes a local file if metadata persistence fails', async () => {
    const { uploadsRouter } = await loadUploadsModule();
    insertDocMock.mockRejectedValueOnce(new Error('503 couch unavailable'));
    const res = await invokeUploads(uploadsRouter, 'post', '/', {
      session: makeSession({ userId: 'owner-1' }),
      body: { blipId: blip._id },
      file: pdfFile(),
    });
    expect(res.statusCode).toBe(500);
    expect(unlinkSpy).toHaveBeenCalledWith(expect.stringMatching(/[0-9a-f-]{36}\.pdf$/));
  });

  it('denies anonymous download of a private-wave upload', async () => {
    const { uploadFilesRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadFilesRouter, 'get', '/:id', {
      params: { id: uploadDoc._id },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({ error: 'unauthenticated', permission: 'read' });
    expect(res.sentFile).toBeUndefined();
  });

  it('streams to an authorized reader with non-cacheable, nosniff headers', async () => {
    const { uploadFilesRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadFilesRouter, 'get', '/:id', {
      session: makeSession({ userId: 'owner-1' }),
      params: { id: uploadDoc._id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.sentFile?.filePath).toMatch(/known\.pdf$/);
    expect(res.headers).toMatchObject({
      'cache-control': 'private, no-store',
      pragma: 'no-cache',
      expires: '0',
      'x-content-type-options': 'nosniff',
      'content-type': 'application/pdf',
    });
    expect(res.headers['content-disposition']).toContain('attachment;');
  });

  it('rechecks access and denies the same known URL immediately after revocation', async () => {
    const { uploadFilesRouter } = await loadUploadsModule();
    findMock.mockResolvedValue({
      docs: [{
        _id: 'participant-1',
        type: 'participant',
        waveId: privateWave._id,
        userId: 'reader-1',
        role: 'viewer',
        status: 'accepted',
      }],
    });
    const allowed = await invokeUploads(uploadFilesRouter, 'get', '/:id', {
      session: makeSession({ userId: 'reader-1' }),
      params: { id: uploadDoc._id },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.sentFile).toBeTruthy();

    findMock.mockResolvedValue({ docs: [] });
    const revoked = await invokeUploads(uploadFilesRouter, 'get', '/:id', {
      session: makeSession({ userId: 'reader-1' }),
      params: { id: uploadDoc._id },
    });
    expect(revoked.statusCode).toBe(403);
    expect(revoked.body).toMatchObject({ error: 'forbidden', permission: 'read' });
    expect(revoked.sentFile).toBeUndefined();
  });

  it('returns 404 rather than falling through to the SPA for unknown metadata', async () => {
    const { uploadFilesRouter } = await loadUploadsModule();
    const res = await invokeUploads(uploadFilesRouter, 'get', '/:id', {
      session: makeSession({ userId: 'owner-1' }),
      params: { id: 'upload:missing' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'upload_not_found' });
  });
});
