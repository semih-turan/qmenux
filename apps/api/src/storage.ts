import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ApiConfig } from './config.js';
import { randomToken } from './crypto.js';
import { ApiError } from './http/problem.js';

export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type ImageType = keyof typeof IMAGE_TYPES;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Content sniffing: the declared Content-Type must match the file's magic bytes. */
export function sniffImage(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Object keys are tenant-prefixed and unguessable. Production storage (Cloudflare R2
 * presigned uploads) is not wired yet; until then only the local development driver exists
 * and production returns 503 STORAGE_NOT_CONFIGURED (DECISIONS.md D-API-04).
 */
export interface Storage {
  readonly kind: 'local' | 'none';
  put(tenantId: string, type: ImageType, body: Buffer): Promise<string>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  publicUrl(key: string | null): string | null;
}

const KEY_RE = /^t\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{22}\.(jpg|png|webp|pdf)$/;
/** PDFs are written by apps/worker into the same tree; they are served only through the authenticated export endpoint. */
export const isPdfKey = (key: string) => key.endsWith('.pdf');

export class LocalStorage implements Storage {
  readonly kind = 'local' as const;
  private readonly root: string;

  constructor(private readonly cfg: ApiConfig) {
    this.root = resolve(cfg.mediaDir);
  }

  async put(tenantId: string, type: ImageType, body: Buffer) {
    const key = `t/${tenantId}/${randomToken(16)}.${IMAGE_TYPES[type]}`;
    const file = join(this.root, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    return key;
  }

  async get(key: string) {
    if (!KEY_RE.test(key)) return null;
    try {
      const body = await readFile(join(this.root, key));
      const ext = key.split('.').pop() as 'jpg' | 'png' | 'webp' | 'pdf';
      return { body, contentType: ext === 'pdf' ? 'application/pdf' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}` };
    } catch {
      return null;
    }
  }

  publicUrl(key: string | null) {
    return key ? `${this.cfg.origins.api}/v1/media/${key}` : null;
  }
}

export class NoStorage implements Storage {
  readonly kind = 'none' as const;
  constructor(private readonly cfg: ApiConfig) {}
  async put(): Promise<string> {
    throw new ApiError(503, 'STORAGE_NOT_CONFIGURED', 'Görsel yükleme henüz yapılandırılmadı');
  }
  async get() {
    return null;
  }
  publicUrl(key: string | null) {
    return key && this.cfg.publicMediaBaseUrl ? `${this.cfg.publicMediaBaseUrl}/${key}` : null;
  }
}

export function createStorage(cfg: ApiConfig): Storage {
  return cfg.isProduction ? new NoStorage(cfg) : new LocalStorage(cfg);
}
