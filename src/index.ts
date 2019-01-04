import { Application, Context } from 'probot';
import * as shortid from 'shortid';
import * as diff from 'diff';

import { runCircleBuild } from './circleci/run';
import { waitForCircle } from './circleci/wait';
import { IContext } from './types';
import { Logger } from './logger';
import { getCircleArtifacts } from './circleci/artifacts';
import { REPO_SLUG } from './circleci/constants';

const { CIRCLECI_TOKEN } = process.env;

async function runCheckOn (context: Context, headSha: string, baseBranch: string, additionalRemote: string) {
  const started_at = new Date();
  const checkContext: IContext = {
    bot: context,
    logger: new Logger(shortid()),
  };
  checkContext.logger.info('Starting check run for:', headSha);

  const check = await context.github.checks.create(context.repo({
    name: 'Artifact Comparison',
    head_sha: headSha,
    status: 'in_progress' as 'in_progress',
    details_url: 'https://github.com/electron/archaeologist',
  }));

  const circleBuildNumber = await runCircleBuild(checkContext, headSha, baseBranch, additionalRemote);
  const buildSuccess = await waitForCircle(checkContext, circleBuildNumber);
  if (!buildSuccess) {
    checkContext.logger.error('CircleCI build failed, cancelling check');
    await context.github.checks.update(context.repo({
      check_run_id: `${check.data.id}`,
      conclusion: 'failure' as 'failure',
      started_at: started_at.toISOString(),
      completed_at: (new Date()).toISOString(),
      details_url: `https://circleci.com/gh/${REPO_SLUG}/${circleBuildNumber}`,
      output: {
        title: 'Digging Failed',
        summary: 'We tried to compare `electron.d.ts` artifacts but something went wrong.',
      },
    }));
    return;
  }

  checkContext.logger.error('CircleCI build succeeded, digging up artifacts');

  const circleArtifacts = await getCircleArtifacts(checkContext, circleBuildNumber);
  if (circleArtifacts.new === circleArtifacts.old) {
    await context.github.checks.update(context.repo({
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
    const patch = diff.createPatch('electron.d.ts', circleArtifacts.old, circleArtifacts.new, '', '');

    await context.github.checks.update(context.repo({
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

const probotRunner = (app: Application) => {
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
