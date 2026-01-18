import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { scanBuffer } from '../lib/virusScan.js';

// AWS SDK v3 - optional, loaded dynamically when S3 storage is enabled
let S3Client: any = null;
let PutObjectCommand: any = null;
let GetObjectCommand: any = null;
let getSignedUrl: any = null;

const uploadRoot = path.resolve(process.cwd(), 'data', 'uploads');
fs.mkdirSync(uploadRoot, { recursive: true });

const documentMimes = new Set([
  'application/pdf',
  'application/zip',
  'application/json',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const imageMimes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
const allowedMimeTypes = new Set([...documentMimes, ...imageMimes]);
const blockedExtensions = new Set(['.exe', '.bat', '.cmd', '.sh', '.msi']);

let s3Client: any = null;
let s3Initialized = false;

// Initialize S3 client lazily on first use
async function ensureS3Initialized() {
  if (s3Initialized) return;

  const storageMode = (process.env['UPLOADS_STORAGE'] || 'local').toLowerCase();
  if (storageMode !== 's3') return;

  const s3Bucket = process.env['UPLOADS_S3_BUCKET'] || '';
  if (!s3Bucket) {
    throw new Error('UPLOADS_S3_BUCKET is required when UPLOADS_STORAGE=s3');
  }

  try {
    // Dynamic import for optional AWS SDK v3
    // Using string variables to prevent Vite from trying to resolve at build time
    const s3ClientPkg = '@aws-sdk/client-s3';
    const presignerPkg = '@aws-sdk/s3-request-presigner';
    const s3Module = await import(/* @vite-ignore */ s3ClientPkg);
    const presignerModule = await import(/* @vite-ignore */ presignerPkg);

    S3Client = s3Module.S3Client;
    PutObjectCommand = s3Module.PutObjectCommand;
    GetObjectCommand = s3Module.GetObjectCommand;
    getSignedUrl = presignerModule.getSignedUrl;

    const endpoint = process.env['UPLOADS_S3_ENDPOINT'];
    const forcePathStyle = process.env['UPLOADS_S3_FORCE_PATH_STYLE'] === '1';

    s3Client = new S3Client({
      credentials: {
        accessKeyId: process.env['UPLOADS_S3_ACCESS_KEY'] || '',
        secretAccessKey: process.env['UPLOADS_S3_SECRET_KEY'] || '',
      },
      endpoint: endpoint || undefined,
      forcePathStyle: forcePathStyle,
      region: process.env['UPLOADS_S3_REGION'] || 'us-east-1',
    });

    s3Initialized = true;
    console.log('[uploads] S3 client initialized');
  } catch (error) {
    console.error('[uploads] Failed to initialize S3 client:', error);
    throw new Error('AWS SDK v3 is required for S3 storage. Install @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner');
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || allowedMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  },
});

export const uploadsRouter = Router();
export const uploadsPath = uploadRoot;

function sanitizeBaseName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

type SniffedType = { mime: string; ext: string | null };

function sniffMime(buffer: Buffer): SniffedType | null {
  if (!buffer || buffer.length < 4) return null;
  if (buffer.slice(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { mime: 'application/x-msdownload', ext: 'exe' };
  }
  const header = buffer.slice(0, 4).toString();
  if (header === 'GIF8') {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (header === '%PDF') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  const zipSignature = buffer.readUInt32BE(0);
  if (zipSignature === 0x504b0304 || zipSignature === 0x504b0506 || zipSignature === 0x504b0708) {
    return { mime: 'application/zip', ext: 'zip' };
  }
  return null;
}

async function persistLocalFile(filename: string, buffer: Buffer): Promise<string> {
  await fs.promises.writeFile(path.join(uploadRoot, filename), buffer);
  return `/uploads/${encodeURIComponent(filename)}`;
}

async function persistS3File(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
  await ensureS3Initialized();

  const s3Bucket = process.env['UPLOADS_S3_BUCKET'] || '';
  const s3BaseUrl = (process.env['UPLOADS_S3_PUBLIC_URL'] || '').replace(/\/$/, '');
  const s3SignedUrlTtl = Number(process.env['UPLOADS_S3_SIGNED_URL_TTL'] || 3600);

  if (!s3Client || !s3Bucket) {
    throw new Error('S3 storage is not configured');
  }

  // Upload file using PutObjectCommand
  const putCommand = new PutObjectCommand({
    Bucket: s3Bucket,
    Key: filename,
    Body: buffer,
    ContentType: mimeType,
    Metadata: {
      'original-name': filename,
    },
  });

  await s3Client.send(putCommand);

  // Return public URL or generate signed URL
  if (s3BaseUrl) {
    return `${s3BaseUrl}/${encodeURIComponent(filename)}`;
  }

  // Generate signed URL for private buckets
  const getCommand = new GetObjectCommand({
    Bucket: s3Bucket,
    Key: filename,
  });

  return await getSignedUrl(s3Client, getCommand, { expiresIn: s3SignedUrlTtl });
}

uploadsRouter.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file || !file.buffer) {
      res.status(400).json({ error: 'missing_file' });
      return;
    }
    if (blockedExtensions.has(path.extname(file.originalname).toLowerCase())) {
      res.status(400).json({ error: 'invalid_file_type' });
      return;
    }

    const sniffed = sniffMime(file.buffer);
    const mimeType = sniffed?.mime || file.mimetype;
    if (!mimeType || (!mimeType.startsWith('image/') && !allowedMimeTypes.has(mimeType))) {
      res.status(400).json({ error: 'invalid_file_type' });
      return;
    }

    try {
      await scanBuffer(file.buffer);
    } catch (error) {
      console.error('[uploads] Virus scan failed', error);
      res.status(400).json({ error: 'virus_detected' });
      return;
    }

    const baseName = sanitizeBaseName(path.basename(file.originalname, path.extname(file.originalname))) || 'upload';
    const ext = sniffed?.ext ? `.${sniffed.ext}` : path.extname(file.originalname);
    const filename = `${baseName}-${randomUUID()}${ext || ''}`;

    let url: string;
    const storageMode = (process.env['UPLOADS_STORAGE'] || 'local').toLowerCase();
    if (storageMode === 's3') {
      url = await persistS3File(filename, file.buffer, mimeType);
    } else {
      url = await persistLocalFile(filename, file.buffer);
    }

    res.status(201).json({
      upload: {
        id: filename,
        url,
        originalName: file.originalname,
        mimeType,
        size: file.size,
      },
    });
  } catch (error) {
    console.error('[uploads] Unexpected error', error);
    res.status(500).json({ error: 'upload_failed' });
  }
});

uploadsRouter.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'invalid_file_type' });
    return;
  }
  next(err);
});
