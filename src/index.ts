import { ApplicationFunction, Context } from 'probot';
import * as cp from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import shortid from 'shortid';

import { runCircleBuild } from './circleci/run';
import { waitForCircle } from './circleci/wait';
import { IContext, PRContext } from './types';
import { Logger } from './logger';
import { getCircleArtifacts } from './circleci/artifacts';
import { REPO_SLUG } from './circleci/constants';
import { withTempDir } from './tmp';

const stripVersion = (dts: string) =>
  dts.replace(/Type definitions for Electron .+?\n/g, '');

async function runCheckOn (context: PRContext, headSha: string, baseBranch: string, additionalRemote: string) {
  const started_at = new Date();
  const checkContext: IContext = {
    bot: context,
    logger: new Logger(shortid()),
  };
  checkContext.logger.info('Starting check run for:', headSha);

  const check = await context.octokit.checks.create(context.repo({
    name: 'Artifact Comparison',
    head_sha: headSha,
    status: 'in_progress' as 'in_progress',
    details_url: 'https://github.com/electron/archaeologist',
  }));

  const circleBuildNumber = await runCircleBuild(checkContext, headSha, baseBranch, additionalRemote);

  await context.octokit.checks.update(context.repo({
    check_run_id: `${check.data.id}`,
    details_url: `https://circleci.com/gh/${REPO_SLUG}/${circleBuildNumber}`,
  }));

  const buildSuccess = await waitForCircle(checkContext, circleBuildNumber);
  if (!buildSuccess) {
    checkContext.logger.error('CircleCI build failed, cancelling check');
    await context.octokit.checks.update(context.repo({
      check_run_id: `${check.data.id}`,
      conclusion: 'failure' as 'failure',
      started_at: started_at.toISOString(),
      completed_at: (new Date()).toISOString(),
      output: {
        title: 'Digging Failed',
        summary: 'We tried to compare `electron.d.ts` artifacts but something went wrong.',
      },
    }));
    return;
  }

  checkContext.logger.error('CircleCI build succeeded, digging up artifacts');

  const circleArtifacts = await getCircleArtifacts(checkContext, circleBuildNumber);
  if (circleArtifacts.missing.length > 0 || !circleArtifacts.new || !circleArtifacts.old || !circleArtifacts.oldDigSpot) {
    await context.octokit.checks.update(context.repo({
      check_run_id: `${check.data.id}`,
      conclusion: 'failure' as 'failure',
      started_at: started_at.toISOString(),
      completed_at: (new Date()).toISOString(),
      output: {
        title: 'Digging Failed',
        summary: 'Although the .d.ts build appears to have succeeded, artifacts were not generated correctly for us to compare',
      },
    }));
    return;
  }

  circleArtifacts.new = stripVersion(circleArtifacts.new);
  circleArtifacts.old = stripVersion(circleArtifacts.old);

  if (circleArtifacts.new === circleArtifacts.old) {
    await context.octokit.checks.update(context.repo({
      check_run_id: `${check.data.id}`,
      conclusion: 'success' as 'success',
      started_at: started_at.toISOString(),
      completed_at: (new Date()).toISOString(),
      output: {
        title: 'No Changes',
        summary: 'We couldn\'t see any changes in the `electron.d.ts` artifact',
      },
    }));
  } else {
    checkContext.logger.info('creating patch');
    const patch = await withTempDir(async (dir) => {
      const newPath = path.resolve(dir, 'electron.new.d.ts');
      const oldPath = path.resolve(dir, 'electron.old.d.ts');
      await fs.writeFile(newPath, circleArtifacts.new);
      await fs.writeFile(oldPath, circleArtifacts.old);
      const diff = cp.spawnSync('git', ['diff', 'electron.old.d.ts', 'electron.new.d.ts'], {
        cwd: dir,
      });
      return diff.stdout.toString().split('\n').slice(2).join('\n');
    });
    checkContext.logger.info('patch created with lenght:', `${patch.length}`);

    await context.octokit.checks.update(context.repo({
      check_run_id: `${check.data.id}`,
      conclusion: 'neutral' as 'neutral',
      started_at: started_at.toISOString(),
      completed_at: (new Date()).toISOString(),
      output: {
        title: 'Changes Detected',
        summary: `Looks like the \`electron.d.ts\` file changed.\n\n\`\`\`\`\`\`diff\n${patch}\n\`\`\`\`\`\``,
      },
    }));
  }
}

const probotRunner: ApplicationFunction = (app) => {
  app.on([
    'pull_request.opened', 
    'pull_request.reopened', 
    'pull_request.synchronize'
  ], async (context) => {
    const headSha = context.payload.pull_request.head.sha;
    const baseBranch = context.payload.pull_request.base.ref;
    const forkRemote = context.payload.pull_request.head.repo.clone_url;

    runCheckOn(context, headSha, baseBranch, forkRemote);
  });
};

module.exports = probotRunner;
