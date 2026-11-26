import { createReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { del, get, put } from '@vercel/blob';
import { env } from '../config/env';

export type UploadFolder = 'quotes' | 'cvs' | 'documents';

interface StoredUpload {
  stream: Readable;
  contentType?: string;
}

/**
 * Vercel Blob is used whenever its credentials are available (OIDC on Vercel,
 * or BLOB_READ_WRITE_TOKEN locally/elsewhere). Without them the app keeps its
 * original local-disk behaviour so Docker Compose development still works.
 */
function useBlob(): boolean {
  if (env.STORAGE_DRIVER === 'blob') return true;
  if (env.STORAGE_DRIVER === 'local') {
    if (env.NODE_ENV === 'production' && process.env.VERCEL) {
      throw new Error('Local storage is not durable on Vercel. Configure Vercel Blob or STORAGE_DRIVER=blob.');
    }
    return false;
  }

  const hasBlobCredentials = Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN),
  );
  if (hasBlobCredentials) return true;
  if (env.NODE_ENV === 'production' && process.env.VERCEL) {
    throw new Error('Durable storage is required on Vercel. Configure Vercel Blob or STORAGE_DRIVER=blob.');
  }
  return false;
}

function isBlobReference(storedName: string): boolean {
  return /^https?:\/\//.test(storedName);
}

function newStoredName(originalName: string): string {
  const extension = path
    .extname(originalName)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '');
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;
}

/** Persist an in-memory multer file and return the identifier stored in the DB. */
export async function persistUpload(
  file: Express.Multer.File,
  folder: UploadFolder,
): Promise<string> {
  const storedName = newStoredName(file.originalname);

  if (useBlob()) {
    // Multer uses a Node Buffer; the Blob SDK accepts an ArrayBuffer body.
    const body = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength,
    ) as ArrayBuffer;
    const blob = await put(`rfy/${folder}/${storedName}`, body, {
      access: 'private',
      contentType: file.mimetype,
    });
    // Blob URLs are safe to store directly: they are unique and never exposed
    // to a browser without the authenticated download endpoint.
    return blob.url;
  }

  const directory = path.join(env.UPLOAD_DIR, folder);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, storedName), file.buffer);
  return storedName;
}

/** Open a stored upload as a stream, regardless of which backend holds it. */
export async function loadUpload(
  storedName: string,
  folder: UploadFolder,
): Promise<StoredUpload> {
  if (isBlobReference(storedName)) {
    const result = await get(storedName, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error('Blob not found');
    }
    return {
      stream: Readable.fromWeb(result.stream as never),
      contentType: result.blob.contentType ?? undefined,
    };
  }

  const absolute = path.join(env.UPLOAD_DIR, folder, path.basename(storedName));
  await access(absolute);
  return { stream: createReadStream(absolute) };
}

/** Best-effort cleanup after a failed database write. */
export async function removeUpload(
  storedName: string | null | undefined,
  folder: UploadFolder,
): Promise<void> {
  if (!storedName) return;

  if (isBlobReference(storedName)) {
    await del(storedName).catch(() => undefined);
    return;
  }

  await unlink(path.join(env.UPLOAD_DIR, folder, path.basename(storedName))).catch(
    () => undefined,
  );
}
