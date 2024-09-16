import { ApplicationFunction, Context } from 'probot';
import * as cp from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import shortid from 'shortid';

import { runCircleBuild } from './circleci/run';
import { waitForCircle } from './circleci/wait';
import { ArtifactsInfo, IContext } from './types';
import { Logger } from './logger';
import { getCircleArtifacts } from './circleci/artifacts';
import { getGHAArtifacts } from './gha/artifacts';
import { REPO_SLUG } from './circleci/constants';
import { withTempDir } from './tmp';

const ARCHAEOLOGIST_CHECK_NAME = process.env.ARCHAEOLOGIST_CHECK_NAME || 'Archaeologist Dig';
const stripVersion = (dts: string) => dts.replace(/Type definitions for Electron .+?\n/g, '');

async function createCheck(
  context: Context,
  checkName: string,
  headSha: string,
  detailsUrl: string,
) {
  return context.octokit.checks.create(
    context.repo({
      name: checkName,
      head_sha: headSha,
      status: 'in_progress' as 'in_progress',
      details_url: detailsUrl,
    }),
  );
}

async function runCheckOn(
  context: Context,
  headSha: string,
  baseBranch: string,
  additionalRemote: string,
) {
  const started_at = new Date();
  const checkContext: IContext = {
    bot: context,
    logger: new Logger(shortid()),
  };
  checkContext.logger.info('Starting CircleCI check run for:', headSha);

  const check = await createCheck(
    context,
    'Artifact Comparison (CircleCI)',
    headSha,
    'https://github.com/electron/archaeologist',    
  );

  const circleBuildNumber = await runCircleBuild(
    checkContext,
    headSha,
    baseBranch,
    additionalRemote,
  );

  await context.octokit.checks.update(
    context.repo({
      check_run_id: `${check.data.id}`,
      details_url: `https://circleci.com/gh/${REPO_SLUG}/${circleBuildNumber}`,
    }),
  );

  const buildSuccess = await waitForCircle(checkContext, circleBuildNumber);
  if (!buildSuccess) {
    checkContext.logger.error('CircleCI build failed, cancelling check');
    await context.octokit.checks.update(
      context.repo({
        check_run_id: `${check.data.id}`,
        conclusion: 'failure' as 'failure',
        started_at: started_at.toISOString(),
        completed_at: new Date().toISOString(),
        output: {
          title: 'Digging Failed',
          summary: 'We tried to compare `electron.d.ts` artifacts but something went wrong.',
        },
      }),
    );
    return;
  }

  checkContext.logger.error('CircleCI build succeeded, digging up artifacts');

  const circleArtifacts = await getCircleArtifacts(checkContext, circleBuildNumber);
  await updateCheckFromArtifacts(context, circleArtifacts, started_at, check.data.id, checkContext);
}

async function updateCheckFromArtifacts(
  context: Context,
  artifacts: ArtifactsInfo,
  started_at: Date,
  checkId: number,
  checkContext: IContext,
) {
  if (artifacts.missing.length > 0 || !artifacts.new || !artifacts.old || !artifacts.oldDigSpot) {
    await context.octokit.checks.update(
      context.repo({
        check_run_id: checkId,
        conclusion: 'failure' as 'failure',
        started_at: started_at.toISOString(),
        completed_at: new Date().toISOString(),
        output: {
          title: 'Digging Failed',
          summary:
            'Although the .d.ts build appears to have succeeded, artifacts were not generated correctly for us to compare',
        },
      }),
    );
    return;
  }

  artifacts.new = stripVersion(artifacts.new);
  artifacts.old = stripVersion(artifacts.old);

  if (artifacts.new === artifacts.old) {
    await context.octokit.checks.update(
      context.repo({
        check_run_id: checkId,
        conclusion: 'success' as 'success',
        started_at: started_at.toISOString(),
        completed_at: new Date().toISOString(),
        output: {
          title: 'No Changes',
          summary: "We couldn't see any changes in the `electron.d.ts` artifact",
        },
      }),
    );
  } else {
    checkContext.logger.info('creating patch');
    const patch = await withTempDir(async (dir) => {
      const newPath = path.resolve(dir, 'electron.new.d.ts');
      const oldPath = path.resolve(dir, 'electron.old.d.ts');
      await fs.writeFile(newPath, artifacts.new);
      await fs.writeFile(oldPath, artifacts.old);
      const diff = cp.spawnSync('git', ['diff', 'electron.old.d.ts', 'electron.new.d.ts'], {
        cwd: dir,
      });
      return diff.stdout.toString().split('\n').slice(2).join('\n');
    });
    checkContext.logger.info('patch created with length:', `${patch.length}`);

    const fullSummary = `Looks like the \`electron.d.ts\` file changed.\n\n\`\`\`\`\`\`diff\n${patch}\n\`\`\`\`\`\``;
    const tooBigSummary = `Looks like the \`electron.d.ts\` file changed, but the diff is too large to display here. See artifacts on the CircleCI build.`;

    await context.octokit.checks.update(
      context.repo({
        check_run_id: checkId,
        conclusion: 'neutral' as 'neutral',
        started_at: started_at.toISOString(),
        completed_at: new Date().toISOString(),
        output: {
          title: 'Changes Detected',
          summary: fullSummary.length > 65535 ? tooBigSummary : fullSummary,
        },
      }),
    );
  }
}

async function runGHACheckOn(context: Context, headSha: string, checkUrl: string, runId: number) {
  const started_at = new Date();
  const checkContext: IContext = {
    bot: context,
    logger: new Logger(shortid()),
  };
  checkContext.logger.info('Starting GHA check run for:', headSha);
  const check = await createCheck(context, 'Artifact Comparison', headSha, checkUrl);
  const artifacts = await getGHAArtifacts(checkContext, runId);
  await updateCheckFromArtifacts(context, artifacts, started_at, check.data.id, checkContext);
}

const probotRunner: ApplicationFunction = (app) => {
  app.on(
    ['pull_request.opened', 'pull_request.reopened', 'pull_request.synchronize'],
    async (context) => {
      const headSha = context.payload.pull_request.head.sha;
      const baseBranch = context.payload.pull_request.base.ref;
      const forkRemote = context.payload.pull_request.head.repo.clone_url;
      runCheckOn(context, headSha, baseBranch, forkRemote);
    },
  );
  app.on(['check_run.completed'], async (context) => {
    if (context.payload.check_run.name === ARCHAEOLOGIST_CHECK_NAME) {
      const headSha = context.payload.check_run.head_sha;
      const checkUrl = context.payload.check_run.url;
      const runId = context.payload.check_run.id;
      runGHACheckOn(context, headSha, checkUrl, runId);
    }
  });
};

module.exports = probotRunner;
