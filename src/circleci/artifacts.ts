import { nodeFetch } from '../fetch';
import { ArtifactsInfo, IContext } from '../types';
import { REPO_SLUG, CIRCLE_TOKEN } from './constants';

const wait = (milliseconds: number) => new Promise<void>((r) => setTimeout(r, milliseconds));

type CircleArtifact = {
  path: string;
  url: string;
  node_index: number;
};

export async function getCircleArtifacts(
  context: IContext,
  buildNumber: number,
  tryCount = 5,
): Promise<ArtifactsInfo> {
  if (tryCount === 0) {
    return {
      missing: ['electron.new.d.ts', 'electron.old.d.ts', '.dig-old'],
      old: null,
      new: null,
      oldDigSpot: null,
    };
  }

  context.logger.info('fetching all artifacts for build:', `${buildNumber}`);
  const response = await nodeFetch(
    `https://circleci.com/api/v2/project/gh/${REPO_SLUG}/${buildNumber}/artifacts`,
    {
      headers: {
        'Circle-Token': CIRCLE_TOKEN,
      },
    },
  );
  if (response.status !== 200) {
    context.logger.error(
      'failed to fetch artifacts for build:',
      `${buildNumber}`,
      'backing off and retrying in a bit',
      `(${tryCount} more attempts)`,
    );
    await wait(10000);
    return getCircleArtifacts(context, buildNumber, tryCount - 1);
  }

  const artifactList: Array<CircleArtifact> = ((await response.json()) as any).items;
  const missing: string[] = [];

  async function getArtifact(name: string, tryCount = 5): Promise<string | null> {
    if (tryCount === 0) {
      missing.push(name);
      return null;
    }

    context.logger.info(`fetching artifact "${name}" for build:`, `${buildNumber}`);
    const circleArtifact = artifactList.find((artifact) => artifact.path.endsWith(name));
    if (!circleArtifact) {
      missing.push(name);
      return null;
    }

    const contentResponse = await nodeFetch(`${circleArtifact.url}?circle-token=${CIRCLE_TOKEN}`);
    if (contentResponse.status !== 200) {
      context.logger.error(
        'failed to fetch artifact',
        `"${circleArtifact.path}"`,
        'from build',
        `"${buildNumber}"`,
        'backing off and retrying in a bit',
        `(${tryCount} more attempts)`,
      );
      await wait(10000);
      return getArtifact(name, tryCount - 1);
    }
    return await contentResponse.text();
  }

  const contents = await Promise.all([
    getArtifact('electron.new.d.ts'),
    getArtifact('electron.old.d.ts'),
    getArtifact('.dig-old'),
  ]);

  return {
    missing,
    new: contents[0],
    old: contents[1],
    oldDigSpot: contents[2] === null ? null : contents[2].trim(),
  };
}
