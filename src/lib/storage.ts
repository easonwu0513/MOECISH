import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';

const STORAGE_DIR = process.env.STORAGE_DIR ?? './uploads';
const STORAGE_ROOT = path.resolve(STORAGE_DIR);

/** 縱深防禦:確保解析後的絕對路徑仍落在 STORAGE_DIR 內,否則視為路徑穿越攻擊。 */
function resolveWithin(...segments: string[]): string {
  const abs = path.resolve(STORAGE_ROOT, ...segments);
  if (abs !== STORAGE_ROOT && !abs.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error('非法儲存路徑');
  }
  return abs;
}

export async function saveBuffer(
  buffer: Buffer,
  namespace: string,
  originalName: string,
): Promise<{ storageKey: string; sha256: string; sizeBytes: number; fileName: string }> {
  // namespace 僅允許安全字元(縱深防禦;呼叫端應已驗證 targetId)
  if (!/^[a-zA-Z0-9/_-]+$/.test(namespace)) {
    throw new Error('非法儲存命名空間');
  }
  const ext = path.extname(originalName) || '';
  const fileName = `${randomUUID()}${ext}`;
  const dir = resolveWithin(namespace);
  await mkdir(dir, { recursive: true });
  const abs = resolveWithin(namespace, fileName);
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
  const abs = resolveWithin(storageKey);
  return readFile(abs);
}

/** 刪除實體檔(佐證刪除用);檔案已不存在視為成功。 */
export async function deleteFileByKey(storageKey: string): Promise<void> {
  const abs = resolveWithin(storageKey);
  try {
    await unlink(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}
