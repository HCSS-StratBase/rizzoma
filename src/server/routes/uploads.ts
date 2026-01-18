import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import AWS from 'aws-sdk';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { scanBuffer } from '../lib/virusScan.js';

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

const storageMode = (process.env['UPLOADS_STORAGE'] || 'local').toLowerCase();
const s3Bucket = process.env['UPLOADS_S3_BUCKET'] || '';
const s3BaseUrl = (process.env['UPLOADS_S3_PUBLIC_URL'] || '').replace(/\/$/, '');
const s3SignedUrlTtl = Number(process.env['UPLOADS_S3_SIGNED_URL_TTL'] || 3600);
let s3: AWS.S3 | null = null;

if (storageMode === 's3') {
  if (!s3Bucket) {
    throw new Error('UPLOADS_S3_BUCKET is required when UPLOADS_STORAGE=s3');
  }
  s3 = new AWS.S3({
    accessKeyId: process.env['UPLOADS_S3_ACCESS_KEY'],
    secretAccessKey: process.env['UPLOADS_S3_SECRET_KEY'],
    endpoint: process.env['UPLOADS_S3_ENDPOINT'] || undefined,
    s3ForcePathStyle: process.env['UPLOADS_S3_FORCE_PATH_STYLE'] === '1',
    signatureVersion: 'v4',
    region: process.env['UPLOADS_S3_REGION'] || 'us-east-1',
  });
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
  if (!s3 || !s3Bucket) {
    throw new Error('S3 storage is not configured');
  }
  await s3
    .upload({
      Bucket: s3Bucket,
      Key: filename,
      Body: buffer,
      ContentType: mimeType,
      Metadata: {
        'original-name': filename,
      },
    })
    .promise();
  if (s3BaseUrl) {
    return `${s3BaseUrl}/${encodeURIComponent(filename)}`;
  }
  return s3.getSignedUrl('getObject', { Bucket: s3Bucket, Key: filename, Expires: s3SignedUrlTtl });
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
