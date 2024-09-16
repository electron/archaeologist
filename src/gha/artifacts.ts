import { ArtifactsInfo } from '../types';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { Context } from 'probot';

const ARTIFACT_FILES = ['electron.new.d.ts', 'electron.old.d.ts', '.dig-old'];

export async function getGHAArtifacts(
  context: Context,
  runId: number,
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

  context.log.info('fetching all artifacts for run:', `${runId}`);

  const artifacts = await context.octokit.rest.actions.listWorkflowRunArtifacts({
    owner: 'electron',
    repo: 'electron',
    run_id: runId,
  });

  if (artifacts.data.artifacts?.length > 0) {
    const artifactZip = await context.octokit.rest.actions.downloadArtifact({
      owner: 'electron',
      repo: 'electron',
      artifact_id: artifacts.data.artifacts[0].id,
      archive_format: 'zip',
    });

    const zipData: any = artifactZip.data;

    const artifactDir = await mkdtemp(tmpdir());
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
  }

  return artifactInfo;
}
