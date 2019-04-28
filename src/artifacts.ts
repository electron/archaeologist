import { Toolkit } from 'actions-toolkit';
import * as cp from 'child_process';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as simpleGit from 'simple-git/promise';

type Artifacts = {
  old: string;
  new: string;
};

const tmpDir = os.tmpdir();

const spawn = async (cmd: string, args: string[], opts: cp.SpawnOptions) => {
  const child = cp.spawn(cmd, args, opts);
  return await new Promise<{ status: number }>(resolve => {
    child.on('exit', code => {
      resolve({ status: code });
    });
  });
};

export const getTSDefs = async (tools: Toolkit, electronDir: string): Promise<string> => {
  tools.log.info('Running npm install in', electronDir);
  const installResult = await spawn('npm', ['install'], {
    cwd: electronDir,
  });
  if (installResult.status !== 0) {
    throw new Error('Failed to run npm install');
  }

  tools.log.info('Generating API defs in', electronDir);
  await spawn(
    'node',
    [
      'node_modules/.bin/electron-docs-linter',
      'docs',
      '--outfile=electron-api.json',
      '--version=0.0.0-archaeologist.0',
    ],
    {
      cwd: electronDir,
      stdio: 'inherit',
    },
  );
  if (!(await fs.pathExists(path.resolve(electronDir, 'electron-api.json')))) {
    throw new Error('Failed to generate electron-api.json');
  }

  tools.log.info('Generating TS defs in', electronDir);
  await spawn(
    'node',
    [
      'node_modules/.bin/electron-typescript-definitions',
      'docs',
      '--in=electron-api.json',
      '--out=electron.d.ts',
    ],
    {
      cwd: electronDir,
      stdio: 'inherit',
    },
  );
  if (!(await fs.pathExists(path.resolve(electronDir, 'electron.d.ts')))) {
    throw new Error('Failed to generator electron.d.ts');
  }

  return await fs.readFile(path.resolve(electronDir, 'electron.d.ts'), 'utf8');
};

export const generateArtifacts = async (tools: Toolkit): Promise<Artifacts> => {
  const pr = tools.context.payload.pull_request;
  const { owner, repo } = tools.context.repo;

  const repoUrl = `https://github.com/${owner}/${repo}.git`;
  const startRoot = path.resolve(tmpDir, 'start');
  const endRoot = path.resolve(tmpDir, 'end');

  const setupGit = async (dir: string) => {
    tools.log.info('resetting directory', dir);
    await fs.remove(dir);
    await fs.mkdirp(dir);
    const git = simpleGit(dir);
    tools.log.info(`cloning ${owner}/${repo} into`, dir);
    await git.clone(repoUrl, '.');
    await git.addRemote('extra', pr.head.repo.clone_url);
    tools.log.info('fetching HEAD remote', pr.head.repo.clone_url);
    await git.fetch('extra');
    return git;
  };

  const [newDefs, oldDefs] = await Promise.all([
    (async () => {
      const startGit = await setupGit(startRoot);
      await startGit.checkout(pr.head.sha);
      return getTSDefs(tools, startRoot);
    })(),
    (async () => {
      const endGit = await setupGit(endRoot);
      await endGit.checkout(pr.base.sha);
      return getTSDefs(tools, endRoot);
    })(),
  ]);

  return {
    new: newDefs,
    old: oldDefs,
  };
};
