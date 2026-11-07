import { AppError } from './errors.js';

export const MB = 1024 * 1024;

export const MAX_IMAGE_SIZE_BYTES = Number(process.env.MAX_IMAGE_SIZE_BYTES ?? 30 * MB); // 30 MB
export const MAX_VIDEO_SIZE_BYTES = Number(process.env.MAX_VIDEO_SIZE_BYTES ?? 200 * MB); // 200 MB
export const MAX_LOG_SIZE_BYTES = Number(process.env.MAX_LOG_SIZE_BYTES ?? 10 * MB); // 10 MB

export type MediaCategory = 'IMAGE' | 'VIDEO' | 'LOG';

export interface MimeRule {
  category: MediaCategory;
  maxBytes: number;
  defaultExt: string;
}

const MIME_QUOTA_MAP: Record<string, MimeRule> = {
  'image/png': { category: 'IMAGE', maxBytes: MAX_IMAGE_SIZE_BYTES, defaultExt: '.png' },
  'image/jpeg': { category: 'IMAGE', maxBytes: MAX_IMAGE_SIZE_BYTES, defaultExt: '.jpg' },
  'image/jpg': { category: 'IMAGE', maxBytes: MAX_IMAGE_SIZE_BYTES, defaultExt: '.jpg' },
  'image/webp': { category: 'IMAGE', maxBytes: MAX_IMAGE_SIZE_BYTES, defaultExt: '.webp' },
  'video/mp4': { category: 'VIDEO', maxBytes: MAX_VIDEO_SIZE_BYTES, defaultExt: '.mp4' },
  'video/x-matroska': { category: 'VIDEO', maxBytes: MAX_VIDEO_SIZE_BYTES, defaultExt: '.mkv' },
  'video/mkv': { category: 'VIDEO', maxBytes: MAX_VIDEO_SIZE_BYTES, defaultExt: '.mkv' },
  'text/plain': { category: 'LOG', maxBytes: MAX_LOG_SIZE_BYTES, defaultExt: '.log' },
  'text/x-log': { category: 'LOG', maxBytes: MAX_LOG_SIZE_BYTES, defaultExt: '.log' },
  'application/json': { category: 'LOG', maxBytes: MAX_LOG_SIZE_BYTES, defaultExt: '.json' },
};

export function resolveMimeQuota(mimeType: string): MimeRule {
  const normalized = mimeType.toLowerCase().trim();
  const rule = MIME_QUOTA_MAP[normalized];

  if (!rule) {
    throw new AppError(
      415,
      `Unsupported MIME type '${mimeType}'. Allowed types: PNG, JPG, WEBP (<= 30 MB), MP4, MKV (<= 200 MB), and textual logs (<= 10 MB).`,
      {
        receivedMimeType: mimeType,
        allowedMimeTypes: Object.keys(MIME_QUOTA_MAP),
      },
    );
  }

  return rule;
}
