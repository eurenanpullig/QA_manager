import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import busboy from 'busboy';
import express from 'express';

import { AppError, buildRfcError } from './errors.js';
import { MAX_VIDEO_SIZE_BYTES, resolveMimeQuota } from './quotas.js';

import type { NextFunction, Request, Response } from 'express';

export const SERVICE_NAME = 'storage-service';

const PORT = Number(process.env.PORT ?? process.env.STORAGE_SERVICE_PORT ?? 5004);
const STORAGE_VOLUME_PATH = process.env.STORAGE_VOLUME_PATH ?? '/var/app/uploads';

const app = express();

async function ensureStorageDirectory(): Promise<void> {
  await fsp.mkdir(STORAGE_VOLUME_PATH, { recursive: true });
}

async function safeUnlink(filePath: string | null): Promise<void> {
  if (!filePath) {
    return;
  }
  try {
    await fsp.unlink(filePath);
  } catch {
    // File already deleted or never created
  }
}

// Healthcheck
app.get(['/health', '/api/v1/storage/health'], (_req: Request, res: Response) => {
  res.status(200).json({
    service: SERVICE_NAME,
    status: 'UP',
    storagePath: STORAGE_VOLUME_PATH,
  });
});

// [2.3.1, 2.3.2, 2.3.3] POST /api/v1/storage/upload (Multipart + Atomic Disk Write + Zero Orphan Rollback)
app.post('/api/v1/storage/upload', async (req: Request, res: Response, next: NextFunction) => {
  const userRole = req.headers['x-user-role'];
  if (userRole === 'DEV' || userRole === 'ADM') {
    next(
      new AppError(403, 'Role is not authorized to upload test execution evidences.', {
        role: userRole,
      }),
    );
    return;
  }

  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('multipart/form-data')) {
    next(
      new AppError(400, 'Content-Type must be multipart/form-data.', {
        receivedContentType: contentType,
      }),
    );
    return;
  }

  await ensureStorageDirectory();

  let tempFilePath: string | null = null;
  let finalFilePath: string | null = null;
  let finalFileName: string | null = null;
  let detectedMimeType = '';
  let totalBytesWritten = 0;
  let fileReceived = false;
  let settled = false;

  const failAndRollback = async (err: AppError): Promise<void> => {
    if (settled) {
      return;
    }
    settled = true;
    await safeUnlink(tempFilePath);
    await safeUnlink(finalFilePath);
    next(err);
  };

  const bb = busboy({
    headers: req.headers,
    limits: {
      files: 1,
      fileSize: MAX_VIDEO_SIZE_BYTES + 1024, // Hard ceiling; per-MIME quota enforced on every chunk
    },
  });

  bb.on('file', (_fieldName, fileStream, info) => {
    fileReceived = true;
    detectedMimeType = info.mimeType;

    let mimeRule;
    try {
      mimeRule = resolveMimeQuota(detectedMimeType);
    } catch (err) {
      fileStream.resume();
      void failAndRollback(
        err instanceof AppError
          ? err
          : new AppError(415, 'Unsupported media type.', { mimeType: detectedMimeType }),
      );
      return;
    }

    const fileUuid = crypto.randomUUID();
    const ext = path.extname(info.filename || '').toLowerCase() || mimeRule.defaultExt;
    finalFileName = `${fileUuid}${ext}`;
    tempFilePath = path.join(STORAGE_VOLUME_PATH, `.tmp-${fileUuid}${ext}.part`);
    finalFilePath = path.join(STORAGE_VOLUME_PATH, finalFileName);

    const writeStream = fs.createWriteStream(tempFilePath, { flags: 'wx' });

    fileStream.on('data', (chunk: Buffer) => {
      totalBytesWritten += chunk.length;
      if (totalBytesWritten > mimeRule.maxBytes) {
        fileStream.unpipe(writeStream);
        fileStream.resume();
        writeStream.destroy();
        void failAndRollback(
          new AppError(
            413,
            `File size exceeds maximum quota of ${Math.round(mimeRule.maxBytes / (1024 * 1024))} MB for ${mimeRule.category} (${detectedMimeType}). Rolled back partial artifact.`,
            {
              category: mimeRule.category,
              mimeType: detectedMimeType,
              maxAllowedBytes: mimeRule.maxBytes,
              receivedBytesAtAbort: totalBytesWritten,
              orphanCleaned: true,
            },
          ),
        );
      }
    });

    fileStream.on('limit', () => {
      fileStream.unpipe(writeStream);
      writeStream.destroy();
      void failAndRollback(
        new AppError(
          413,
          `File size exceeds maximum quota for ${mimeRule.category}. Rolled back partial artifact.`,
          {
            category: mimeRule.category,
            mimeType: detectedMimeType,
            maxAllowedBytes: mimeRule.maxBytes,
            orphanCleaned: true,
          },
        ),
      );
    });

    fileStream.on('error', (err: Error) => {
      writeStream.destroy();
      void failAndRollback(
        new AppError(500, `Upload stream aborted: ${err.message}. Partial file deleted.`, {
          orphanCleaned: true,
        }),
      );
    });

    writeStream.on('error', (err: Error) => {
      fileStream.resume();
      void failAndRollback(
        new AppError(500, `Disk write error: ${err.message}. Partial file deleted.`, {
          orphanCleaned: true,
        }),
      );
    });

    writeStream.on('finish', () => {
      void (async () => {
        if (settled) {
          await safeUnlink(tempFilePath);
          return;
        }

        if (totalBytesWritten === 0) {
          await failAndRollback(
            new AppError(422, 'Uploaded file cannot be empty (0 bytes).', {
              orphanCleaned: true,
            }),
          );
          return;
        }

        try {
          if (!tempFilePath || !finalFilePath || !finalFileName) {
            throw new Error('Missing atomic target path.');
          }
          // Atomic rename from .tmp-*.part to final destination
          await fsp.rename(tempFilePath, finalFilePath);
          tempFilePath = null;
          settled = true;

          res.status(201).json({
            file_path: `/api/v1/storage/files/${finalFileName}`,
            file_size_bytes: totalBytesWritten,
            file_type: detectedMimeType,
          });
        } catch (err) {
          await failAndRollback(
            new AppError(
              500,
              `Failed to commit atomic file to storage: ${err instanceof Error ? err.message : 'Unknown error'}`,
              { orphanCleaned: true },
            ),
          );
        }
      })();
    });

    fileStream.pipe(writeStream);
  });

  bb.on('error', (err: Error) => {
    void failAndRollback(
      new AppError(400, `Malformed multipart upload stream: ${err.message}`, {
        orphanCleaned: true,
      }),
    );
  });

  bb.on('finish', () => {
    if (!fileReceived && !settled) {
      void failAndRollback(
        new AppError(400, 'No file field was provided in the multipart/form-data payload.'),
      );
    }
  });

  req.on('aborted', () => {
    void failAndRollback(
      new AppError(400, 'Client connection aborted during upload. Partial artifact rolled back.', {
        orphanCleaned: true,
      }),
    );
  });

  req.pipe(bb);
});

// [2.3.4] Protected static file streaming download route
app.get(
  '/api/v1/storage/files/:filename',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawFilename = req.params.filename ?? '';
      const sanitizedFilename = path.basename(rawFilename);

      if (!sanitizedFilename || sanitizedFilename.startsWith('.tmp-')) {
        throw new AppError(400, 'Invalid evidence filename.');
      }

      const fullPath = path.join(STORAGE_VOLUME_PATH, sanitizedFilename);
      let stat: fs.Stats;
      try {
        stat = await fsp.stat(fullPath);
      } catch {
        throw new AppError(404, 'Evidence file not found on storage volume.', {
          filename: sanitizedFilename,
        });
      }

      if (!stat.isFile()) {
        throw new AppError(404, 'Evidence artifact is not a regular file.');
      }

      const ext = path.extname(sanitizedFilename).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.mkv': 'video/x-matroska',
        '.log': 'text/plain; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
      };

      res.setHeader('Content-Type', contentTypeMap[ext] ?? 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Content-Disposition', `inline; filename="${sanitizedFilename}"`);

      const readStream = fs.createReadStream(fullPath);
      readStream.on('error', (err) => {
        next(new AppError(500, `Error streaming evidence file: ${err.message}`));
      });
      readStream.pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

// Global RFC Error Handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildRfcError(err.statusCode, err.message, err.details));
    return;
  }

  const fallbackMessage =
    err instanceof Error ? err.message : 'An unexpected error occurred in storage-service.';
  res.status(500).json(buildRfcError(500, fallbackMessage, { path: req.originalUrl }));
});

app.listen(PORT, '0.0.0.0', () => {
  console.info(`[${SERVICE_NAME}] Listening on port ${PORT} (volume: ${STORAGE_VOLUME_PATH})`);
});
