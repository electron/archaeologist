import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import { getGHAArtifacts } from './artifacts.js';
import { Context } from 'probot';
import { readdir, readFile, writeFile } from 'node:fs/promises';

// Mock setTimeout from node:timers/promises
vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

// Mock child_process for execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock tmp module
let mockTempDirCallback: ((dir: string) => Promise<any>) | null = null;
vi.mock('../tmp', () => ({
  withTempDir: vi.fn(async (fn: (dir: string) => Promise<any>) => {
    mockTempDirCallback = fn;
    return await fn('/mock/temp/dir');
  }),
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('getGHAArtifacts', () => {
  let mockContext: any;
  const mockReaddir = vi.mocked(readdir) as unknown as MockedFunction<
    (path: string) => Promise<string[]>
  >;
  const mockReadFile = vi.mocked(readFile) as unknown as MockedFunction<
    (path: string) => Promise<Buffer>
  >;
  const mockWriteFile = vi.mocked(writeFile);

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
      octokit: {
        rest: {
          actions: {
            getJobForWorkflowRun: vi.fn(),
            listWorkflowRunArtifacts: vi.fn(),
            downloadArtifact: vi.fn(),
          },
        },
      },
    };
  });

  it('should return empty artifact info when tryCount is 0', async () => {
    const result = await getGHAArtifacts(mockContext as Context, 12345, 0);

    expect(result).toEqual({
      missing: ['electron.new.d.ts', 'electron.old.d.ts', '.dig-old'],
      new: null,
      old: null,
      oldDigSpot: null,
    });
  });

  it('should retry when job fetch fails', async () => {
    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValueOnce({
      status: 500,
    });
    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValueOnce({
      status: 200,
      data: { run_id: 67890 },
    });
    mockContext.octokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      status: 200,
      data: { artifacts: [] },
    });

    const result = await getGHAArtifacts(mockContext as Context, 12345, 2);

    expect(mockContext.octokit.rest.actions.getJobForWorkflowRun).toHaveBeenCalledTimes(2);
    expect(mockContext.log.error).toHaveBeenCalledWith(
      'failed to fetch job:',
      '12345',
      'backing off and retrying in a bit',
      '(2 more attempts)',
    );
  });

  it('should retry when artifacts fetch fails', async () => {
    mockContext.octokit.rest.actions.getJobForWorkflowRun
      .mockResolvedValueOnce({
        status: 200,
        data: { run_id: 67890 },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { run_id: 67890 },
      });

    mockContext.octokit.rest.actions.listWorkflowRunArtifacts
      .mockResolvedValueOnce({
        status: 500,
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { artifacts: [] },
      });

    const result = await getGHAArtifacts(mockContext as Context, 12345, 2);

    expect(mockContext.octokit.rest.actions.listWorkflowRunArtifacts).toHaveBeenCalledTimes(2);
    expect(mockContext.log.error).toHaveBeenCalledWith(
      'failed to fetch artifacts for run: 67890',
      'backing off and retrying in a bit (2 more attempts)',
    );
  });

  it('should handle empty artifacts list', async () => {
    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValue({
      status: 200,
      data: { run_id: 67890 },
    });
    mockContext.octokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      status: 200,
      data: { artifacts: [] },
    });

    const result = await getGHAArtifacts(mockContext as Context, 12345);

    expect(result).toEqual({
      missing: ['electron.new.d.ts', 'electron.old.d.ts', '.dig-old'],
      new: null,
      old: null,
      oldDigSpot: null,
    });
    expect(mockContext.log.error).toHaveBeenCalledWith('no artifacts found for run:', '67890');
  });

  it('should call getJobForWorkflowRun with correct parameters', async () => {
    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValue({
      status: 200,
      data: { run_id: 67890 },
    });
    mockContext.octokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      status: 200,
      data: { artifacts: [] },
    });

    await getGHAArtifacts(mockContext as Context, 12345);

    expect(mockContext.octokit.rest.actions.getJobForWorkflowRun).toHaveBeenCalledWith({
      owner: 'electron',
      repo: 'electron',
      job_id: 12345,
    });
  });

  it('should call listWorkflowRunArtifacts with correct parameters', async () => {
    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValue({
      status: 200,
      data: { run_id: 67890 },
    });
    mockContext.octokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      status: 200,
      data: { artifacts: [] },
    });

    await getGHAArtifacts(mockContext as Context, 12345);

    expect(mockContext.octokit.rest.actions.listWorkflowRunArtifacts).toHaveBeenCalledWith({
      owner: 'electron',
      repo: 'electron',
      run_id: 67890,
    });
  });

  it('should download and extract artifacts successfully', async () => {
    const mockZipData = Buffer.from('mock-zip-data');

    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValue({
      status: 200,
      data: { run_id: 67890 },
    });
    mockContext.octokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      status: 200,
      data: {
        artifacts: [{ id: 11111, name: 'test-artifact' }],
      },
    });
    mockContext.octokit.rest.actions.downloadArtifact.mockResolvedValue({
      data: mockZipData,
    });

    mockReaddir.mockResolvedValue([
      'electron.new.d.ts',
      'electron.old.d.ts',
      '.dig-old',
      'artifacts.zip',
    ]);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('electron.new.d.ts')) {
        return Buffer.from('new content');
      }
      if (path.includes('electron.old.d.ts')) {
        return Buffer.from('old content');
      }
      if (path.includes('.dig-old')) {
        return Buffer.from('dig spot');
      }
      return Buffer.from('');
    });

    const result = await getGHAArtifacts(mockContext as Context, 12345);

    expect(mockContext.octokit.rest.actions.downloadArtifact).toHaveBeenCalledWith({
      owner: 'electron',
      repo: 'electron',
      artifact_id: 11111,
      archive_format: 'zip',
    });
    expect(mockWriteFile).toHaveBeenCalled();
    expect(result).toEqual({
      missing: [],
      new: 'new content',
      old: 'old content',
      oldDigSpot: 'dig spot',
    });
  });

  it('should handle partial artifact files', async () => {
    const mockZipData = Buffer.from('mock-zip-data');

    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValue({
      status: 200,
      data: { run_id: 67890 },
    });
    mockContext.octokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      status: 200,
      data: {
        artifacts: [{ id: 11111, name: 'test-artifact' }],
      },
    });
    mockContext.octokit.rest.actions.downloadArtifact.mockResolvedValue({
      data: mockZipData,
    });

    // Only return electron.new.d.ts, missing the others
    mockReaddir.mockResolvedValue(['electron.new.d.ts', 'artifacts.zip']);
    mockReadFile.mockResolvedValue(Buffer.from('new content only'));

    const result = await getGHAArtifacts(mockContext as Context, 12345);

    expect(result).toEqual({
      missing: ['electron.old.d.ts', '.dig-old'],
      new: 'new content only',
      old: null,
      oldDigSpot: null,
    });
  });

  it('should filter out non-artifact files from temp directory', async () => {
    const mockZipData = Buffer.from('mock-zip-data');

    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValue({
      status: 200,
      data: { run_id: 67890 },
    });
    mockContext.octokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      status: 200,
      data: {
        artifacts: [{ id: 11111, name: 'test-artifact' }],
      },
    });
    mockContext.octokit.rest.actions.downloadArtifact.mockResolvedValue({
      data: mockZipData,
    });

    // Include unrelated files
    mockReaddir.mockResolvedValue([
      'electron.new.d.ts',
      'random-file.txt',
      'another-file.js',
      'artifacts.zip',
    ]);
    mockReadFile.mockResolvedValue(Buffer.from('new content'));

    const result = await getGHAArtifacts(mockContext as Context, 12345);

    // Should only process electron.new.d.ts from the artifact files list
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(result.new).toBe('new content');
    expect(result.missing).toEqual(['electron.old.d.ts', '.dig-old']);
  });

  it('should download artifact with correct artifact ID', async () => {
    const mockZipData = Buffer.from('mock-zip-data');
    const artifactId = 99999;

    mockContext.octokit.rest.actions.getJobForWorkflowRun.mockResolvedValue({
      status: 200,
      data: { run_id: 67890 },
    });
    mockContext.octokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({
      status: 200,
      data: {
        artifacts: [{ id: artifactId, name: 'my-artifact' }],
      },
    });
    mockContext.octokit.rest.actions.downloadArtifact.mockResolvedValue({
      data: mockZipData,
    });
    mockReaddir.mockResolvedValue([]);

    await getGHAArtifacts(mockContext as Context, 12345);

    expect(mockContext.octokit.rest.actions.downloadArtifact).toHaveBeenCalledWith({
      owner: 'electron',
      repo: 'electron',
      artifact_id: artifactId,
      archive_format: 'zip',
    });
  });
});
