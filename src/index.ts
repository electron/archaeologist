import * as cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ApplicationFunction, Context } from 'probot';

import { ArtifactsInfo } from './types';
import { getGHAArtifacts } from './gha/artifacts';
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

async function updateCheckFromArtifacts(
  context: Context,
  artifacts: ArtifactsInfo,
  started_at: Date,
  checkId: number,
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
    context.log.info('Creating patch');
    const patch = await withTempDir(async (dir) => {
      const newPath = path.resolve(dir, 'electron.new.d.ts');
      const oldPath = path.resolve(dir, 'electron.old.d.ts');
      await fs.writeFile(newPath, artifacts.new!);
      await fs.writeFile(oldPath, artifacts.old!);
      const diff = cp.spawnSync('git', ['diff', 'electron.old.d.ts', 'electron.new.d.ts'], {
        cwd: dir,
      });
      return diff.stdout.toString().split('\n').slice(2).join('\n');
    });

    context.log.info(`Patch created with length: ${patch.length}`);

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

async function runGHACheckOn(context: Context, headSha: string, checkUrl: string, jobId: number) {
  const started_at = new Date();

  context.log.info(`Starting GHA check run for: ${headSha}`);

  const check = await createCheck(context, 'Artifact Comparison', headSha, checkUrl);
  const artifacts = await getGHAArtifacts(context, jobId);
  await updateCheckFromArtifacts(context, artifacts, started_at, check.data.id);
}

const probotRunner: ApplicationFunction = (app) => {
  app.on(['check_run.completed'], async (context) => {
    const { check_run } = context.payload;
    if (check_run.name === ARCHAEOLOGIST_CHECK_NAME) {
      const headSha = check_run.head_sha;
      const checkUrl = check_run.url;
      const runId = check_run.id;
      runGHACheckOn(context, headSha, checkUrl, runId);
    }
  });
};

module.exports = probotRunner;
