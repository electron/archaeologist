import fetch from 'node-fetch';

import { IContext } from '../types';
import { REPO_SLUG, CIRCLE_TOKEN } from './constants';

export async function getCircleArtifacts (context: IContext, buildNumber: number) {
  context.logger.info('fetching all artifacts for build:', `${buildNumber}`);
  const response = await fetch(
    `https://circleci.com/api/v1.1/project/github/${REPO_SLUG}/${buildNumber}/artifacts?circle-token=${CIRCLE_TOKEN}`
  );
  const artifactList = await response.json();
  const missing: string[] = [];

  async function getArtifact (name: string) {
    context.logger.info(`fetching artifact "${name}" for build:`, `${buildNumber}`);
    const circleArtifact = artifactList.find(artifact => artifact.path.endsWith(name));
    if (!circleArtifact) {
      missing.push(name);
      return null;
    }

    const contentResponse = await fetch(`${circleArtifact.url}?circle-token=${CIRCLE_TOKEN}`);
    return await contentResponse.text();
  }

  const contents = await Promise.all([
    getArtifact('electron.new.d.ts'),
    getArtifact('electron.old.d.ts'),
    getArtifact('.dig-old'),
  ])

  return {
    missing,
    new: contents[0],
    old: contents[1],
    oldDigSpot: contents[2].trim(),
  };
}