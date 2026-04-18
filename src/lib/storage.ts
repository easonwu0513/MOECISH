import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const STORAGE_DIR = process.env.STORAGE_DIR ?? './uploads';

export async function saveBuffer(
  buffer: Buffer,
  namespace: string,
  originalName: string,
): Promise<{ storageKey: string; sha256: string; sizeBytes: number; fileName: string }> {
  const ext = path.extname(originalName) || '';
  const fileName = `${randomUUID()}${ext}`;
  const dir = path.join(STORAGE_DIR, namespace);
  await mkdir(dir, { recursive: true });
  const abs = path.join(dir, fileName);
  await writeFile(abs, buffer);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return {
    storageKey: path.posix.join(namespace, fileName),
    sha256,
    sizeBytes: buffer.length,
    fileName,
  };
}

export async function readFileByKey(storageKey: string): Promise<Buffer> {
  const abs = path.join(STORAGE_DIR, storageKey);
  return readFile(abs);
}
