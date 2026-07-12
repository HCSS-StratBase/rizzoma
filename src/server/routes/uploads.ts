import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtect } from '../middleware/csrf.js';
import { scanBuffer, VirusDetectedError, VirusScanUnavailableError } from '../lib/virusScan.js';
import { getDoc, insertDoc } from '../lib/couch.js';
import {
  identityFromRequest,
  requireWaveAccess,
  resolveBlipAccess,
  sendAccessDenied,
} from '../lib/access.js';

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
// SVG is active XML content, not a passive raster image. Keep upload previews
// limited to formats browsers render in an <img> without script execution.
const imageMimes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const allowedMimeTypes = new Set([...documentMimes, ...imageMimes]);
const blockedExtensions = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.msi',
  '.html', '.htm', '.xhtml', '.js', '.mjs', '.cjs', '.svg', '.xml',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  },
});

export const uploadsRouter = Router();
export const uploadFilesRouter = Router();
export const uploadsPath = uploadRoot;

type SniffedType = { mime: string; ext: string | null };

type UploadDoc = {
  _id: string;
  type: 'upload';
  waveId: string;
  blipId: string;
  uploaderId: string;
  storage: 'local';
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: number;
};

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
  if (header === 'RIFF' && buffer.length >= 12 && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  const zipSignature = buffer.readUInt32BE(0);
  if (zipSignature === 0x504b0304 || zipSignature === 0x504b0506 || zipSignature === 0x504b0708) {
    return { mime: 'application/zip', ext: 'zip' };
  }
  return null;
}

function uploadUrl(uploadId: string): string {
  return `/uploads/${encodeURIComponent(uploadId)}`;
}

function localUploadPath(storageKey: string): string | null {
  if (!storageKey || storageKey !== path.basename(storageKey)) return null;
  const resolved = path.resolve(uploadRoot, storageKey);
  return path.dirname(resolved) === uploadRoot ? resolved : null;
}

function storageExtension(mimeType: string, sniffed: SniffedType | null): string {
  const fixedByMime: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/json': 'json',
    'application/msword': 'doc',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  const extension = sniffed?.ext || fixedByMime[mimeType] || 'bin';
  return `.${extension}`;
}

function contentDisposition(originalName: string, inline: boolean): string {
  const name = path.basename(originalName || 'download');
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function isInlineSafeImage(mimeType: string): boolean {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType);
}

uploadsRouter.post('/', requireAuth, csrfProtect(), upload.single('file'), async (req, res) => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file || !file.buffer) {
      res.status(400).json({ error: 'missing_file' });
      return;
    }

    const blipId = String(req.body?.['blipId'] || '').trim();
    if (!blipId) {
      res.status(400).json({ error: 'missing_blip_id' });
      return;
    }

    const identity = identityFromRequest(req);
    const resolved = await resolveBlipAccess(blipId, identity);
    if (!resolved.access.canEdit) {
      sendAccessDenied(res, identity, 'edit', (req as any)?.id);
      return;
    }
    const waveId = String(resolved.blip.waveId || '');
    const claimedWaveId = String(req.body?.['waveId'] || '').trim();
    if (claimedWaveId && claimedWaveId !== waveId) {
      res.status(400).json({ error: 'wave_mismatch' });
      return;
    }

    // Public or pre-signed object-store URLs remain usable after a role is
    // revoked. Until S3 is proxied through this same per-request ACL, fail
    // closed instead of minting a non-revocable attachment URL.
    const storageMode = (process.env['UPLOADS_STORAGE'] || 'local').toLowerCase();
    if (storageMode !== 'local') {
      res.status(503).json({ error: 'upload_storage_acl_unavailable' });
      return;
    }

    if (blockedExtensions.has(path.extname(file.originalname).toLowerCase())) {
      res.status(400).json({ error: 'invalid_file_type' });
      return;
    }

    const sniffed = sniffMime(file.buffer);
    const mimeType = sniffed?.mime || file.mimetype;
    if (!mimeType || !allowedMimeTypes.has(mimeType)) {
      res.status(400).json({ error: 'invalid_file_type' });
      return;
    }

    try {
      await scanBuffer(file.buffer);
    } catch (error) {
      if (error instanceof VirusDetectedError) {
        res.status(400).json({ error: 'virus_detected' });
        return;
      }
      console.error('[uploads] Virus scan unavailable', error);
      res.status(error instanceof VirusScanUnavailableError ? 503 : 500).json({ error: 'virus_scan_unavailable' });
      return;
    }

    const opaqueId = randomUUID();
    const uploadId = `upload:${opaqueId}`;
    const storageKey = `${opaqueId}${storageExtension(mimeType, sniffed)}`;
    const storagePath = localUploadPath(storageKey);
    if (!storagePath) throw new Error('invalid_upload_storage_key');

    await fs.promises.writeFile(storagePath, file.buffer, { flag: 'wx', mode: 0o600 });
    try {
      const metadata: UploadDoc = {
        _id: uploadId,
        type: 'upload',
        waveId,
        blipId: String(resolved.blip._id || blipId),
        uploaderId: req.user!.id,
        storage: 'local',
        storageKey,
        originalName: file.originalname,
        mimeType,
        size: file.size,
        createdAt: Date.now(),
      };
      await insertDoc(metadata);
    } catch (error) {
      await fs.promises.unlink(storagePath).catch((cleanupError) => {
        console.error('[uploads] Failed to clean unindexed upload', cleanupError);
      });
      throw error;
    }

    res.status(201).json({
      upload: {
        id: uploadId,
        url: uploadUrl(uploadId),
        originalName: file.originalname,
        mimeType,
        size: file.size,
      },
    });
  } catch (error: any) {
    if (String(error?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'blip_not_found' });
      return;
    }
    console.error('[uploads] Unexpected error', error);
    res.status(500).json({ error: 'upload_failed' });
  }
});

// Attachment bytes are never static assets: the current wave role is checked
// on every request so logout, participant removal, or a private-policy change
// takes effect immediately. The service worker must treat /uploads as
// network-only; it is intentionally changed in the sharing/cache patch.
uploadFilesRouter.get('/:id', async (req, res, next) => {
  const uploadId = String(req.params['id'] || '');
  try {
    const metadata = await getDoc<UploadDoc>(uploadId);
    if (!metadata || metadata.type !== 'upload') {
      res.status(404).json({ error: 'upload_not_found' });
      return;
    }

    const access = await requireWaveAccess(req, res, metadata.waveId, 'read');
    if (!access) return;

    if (metadata.storage !== 'local') {
      res.status(503).json({ error: 'upload_storage_acl_unavailable' });
      return;
    }
    const storagePath = localUploadPath(metadata.storageKey);
    if (!storagePath) {
      res.status(500).json({ error: 'invalid_upload_metadata' });
      return;
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', metadata.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      contentDisposition(metadata.originalName, isInlineSafeImage(metadata.mimeType)),
    );
    res.sendFile(storagePath, { cacheControl: false, dotfiles: 'deny' }, (error) => {
      if (!error) return;
      if (!res.headersSent) {
        res.status((error as any)?.code === 'ENOENT' ? 404 : 500).json({
          error: (error as any)?.code === 'ENOENT' ? 'upload_not_found' : 'upload_read_failed',
        });
        return;
      }
      next(error);
    });
  } catch (error: any) {
    if (String(error?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'upload_not_found' });
      return;
    }
    console.error('[uploads] Download failed', error);
    res.status(500).json({ error: 'upload_read_failed' });
  }
});

uploadsRouter.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'invalid_file_type' });
    return;
  }
  next(err);
});
