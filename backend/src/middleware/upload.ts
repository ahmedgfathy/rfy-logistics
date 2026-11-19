import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Request } from 'express';
import { env } from '../config/env';
import { ApiError } from './error';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storageFor(subfolder: 'quotes' | 'cvs') {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, ensureDir(path.join(env.UPLOAD_DIR, subfolder)));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });
}

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(ApiError.badRequest('Unsupported file type. Allowed: PDF, PNG, JPG, WEBP, DOCX, XLSX.'));
    return;
  }
  cb(null, true);
}

export const quoteUpload = multer({
  storage: storageFor('quotes'),
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 3 },
});

export const cvUpload = multer({
  storage: storageFor('cvs'),
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});
