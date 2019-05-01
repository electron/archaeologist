import * as fs from 'fs-extra';
import *  as path from 'path';
import * as os from 'os';

const tmpBase = path.resolve(os.tmpdir(), 'diffing');

export const withTempDir = async (fn: (dir: string) => Promise<void>) => {
  const tmpDir = await fs.mkdtemp(tmpBase);
  try {
    await fn(tmpDir);
  } finally {
    await fs.remove(tmpDir);
  }
}