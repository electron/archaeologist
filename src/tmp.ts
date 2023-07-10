import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const tmpBase = path.resolve(os.tmpdir(), 'diffing');

export const withTempDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const tmpDir = await fs.mkdtemp(tmpBase);
  try {
    return await fn(tmpDir);
  } finally {
    await fs.remove(tmpDir);
  }
};
