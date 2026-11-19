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

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(ApiError.badRequest('Unsupported file type. Allowed: PDF, PNG, JPG, WEBP, DOCX, XLSX.'));
    return;
  }
  cb(null, true);
}

// Files are buffered in memory and persisted by src/lib/storage.ts. This keeps
// the same behaviour for local Docker development and Vercel serverless runs,
// where the filesystem is read-only and ephemeral.
export const quoteUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 3 },
});

export const cvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});
