import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const tmpBase = path.resolve(os.tmpdir(), 'diffing');

export const withTempDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const tmpDir = await fs.mkdtemp(tmpBase);
  try {
    return await fn(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true });
  }
};
