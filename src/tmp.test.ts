import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { withTempDir } from './tmp.js';

describe('withTempDir', () => {
  it('should create a temporary directory and pass it to the function', async () => {
    let capturedDir: string | null = null;

    await withTempDir(async (dir) => {
      capturedDir = dir;
      // Verify the directory exists
      const stats = await fs.stat(dir);
      expect(stats.isDirectory()).toBe(true);
      expect(dir).toContain('diffing');
    });

    expect(capturedDir).not.toBeNull();
  });

  it('should clean up the temporary directory after execution', async () => {
    let tempDirPath: string | null = null;

    await withTempDir(async (dir) => {
      tempDirPath = dir;
      // Create a file in the temp directory
      await fs.writeFile(path.join(dir, 'test.txt'), 'test content');
    });

    // Verify the directory no longer exists
    await expect(fs.access(tempDirPath!)).rejects.toThrow();
  });

  it('should return the value from the callback function', async () => {
    const result = await withTempDir(async (dir) => {
      return 'test-result';
    });

    expect(result).toBe('test-result');
  });

  it('should clean up even if the function throws an error', async () => {
    let tempDirPath: string | null = null;

    await expect(async () => {
      await withTempDir(async (dir) => {
        tempDirPath = dir;
        throw new Error('Test error');
      });
    }).rejects.toThrow('Test error');

    // Verify cleanup still happened
    await expect(fs.access(tempDirPath!)).rejects.toThrow();
  });

  it('should allow writing and reading files in the temp directory', async () => {
    const result = await withTempDir(async (dir) => {
      const filePath = path.join(dir, 'test.txt');
      const content = 'Hello, world!';

      await fs.writeFile(filePath, content);
      const readContent = await fs.readFile(filePath, 'utf-8');

      return readContent;
    });

    expect(result).toBe('Hello, world!');
  });
});
