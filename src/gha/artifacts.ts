import { readdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import { Context } from 'probot';

import { ArtifactsInfo } from '../types';
import { withTempDir } from '../tmp';

const ARTIFACT_FILES = ['electron.new.d.ts', 'electron.old.d.ts', '.dig-old'];
const wait = (milliseconds: number) => new Promise<void>((r) => setTimeout(r, milliseconds));

export async function getGHAArtifacts(
  context: Context,
  jobId: number,
  tryCount = 5,
): Promise<ArtifactsInfo> {
  const artifactInfo: ArtifactsInfo = {
    missing: ARTIFACT_FILES.slice(),
    new: null,
    old: null,
    oldDigSpot: null,
  };

  if (tryCount === 0) {
    return artifactInfo;
  }

  context.log.info('fetching all artifacts for job:', `${jobId}`);

  const job = await context.octokit.rest.actions.getJobForWorkflowRun({
    owner: 'electron',
    repo: 'electron',
    job_id: jobId,
  });

  if (job.status != 200) {
    context.log.error(
      'failed to fetch job:',
      `${jobId}`,
      'backing off and retrying in a bit',
      `(${tryCount} more attempts)`,
    );
    await wait(10000);
    return getGHAArtifacts(context, jobId, tryCount - 1);
  }

  const artifacts = await context.octokit.rest.actions.listWorkflowRunArtifacts({
    owner: 'electron',
    repo: 'electron',
    run_id: job.data.run_id,
  });

  if (artifacts.status != 200) {
    context.log.error(
      `failed to fetch artifacts for run: ${job.data.run_id}`,
      `backing off and retrying in a bit (${tryCount} more attempts)`,
    );
    await wait(10000);
    return getGHAArtifacts(context, jobId, tryCount - 1);
  }

  if (artifacts.data.artifacts?.length > 0) {
    const artifactZip = await context.octokit.rest.actions.downloadArtifact({
      owner: 'electron',
      repo: 'electron',
      artifact_id: artifacts.data.artifacts[0].id,
      archive_format: 'zip',
    });

    const zipData: any = artifactZip.data;

    await withTempDir(async (artifactDir) => {
      const artifactZipFile = path.join(artifactDir, 'artifacts.zip');
      await writeFile(artifactZipFile, Buffer.from(zipData));
      execSync(`unzip -o ${artifactZipFile} -d ${artifactDir}`);
      const files = await readdir(artifactDir);
      for (const artifactFile of files) {
        if (ARTIFACT_FILES.includes(artifactFile)) {
          artifactInfo.missing = artifactInfo.missing.filter(
            (fileToFilter) => fileToFilter != artifactFile,
          );
          const artifactFilePath = path.join(artifactDir, artifactFile);
          const artifactContents = await readFile(artifactFilePath);

          switch (artifactFile) {
            case 'electron.new.d.ts':
              artifactInfo.new = artifactContents.toString();
              break;
            case 'electron.old.d.ts':
              artifactInfo.old = artifactContents.toString();
              break;
            case '.dig-old':
              artifactInfo.oldDigSpot = artifactContents.toString();
              break;
          }
        }
      }
    });
  } else {
    context.log.error('no artifacts found for run:', `${job.data.run_id}`);
  }

  return artifactInfo;
}
