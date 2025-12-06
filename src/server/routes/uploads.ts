import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';

const uploadRoot = path.resolve(process.cwd(), 'data', 'uploads');
fs.mkdirSync(uploadRoot, { recursive: true });

const allowedTypes = new Set([
  'application/pdf',
  'application/zip',
  'application/json',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${base}-${suffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    if (allowedTypes.has(file.mimetype)) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  },
});

export const uploadsRouter = Router();
export const uploadsPath = uploadRoot;

uploadsRouter.post('/', requireAuth, upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'missing_file' });
    return;
  }

  res.status(201).json({
    upload: {
      id: file.filename,
      url: `/uploads/${encodeURIComponent(file.filename)}`,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    },
  });
});

uploadsRouter.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'invalid_file_type' });
    return;
  }
  next(err);
});
