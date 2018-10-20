import fetch from 'node-fetch';

import { CIRCLE_TOKEN, REPO_SLUG } from './constants';
import { IContext } from '../types';

export async function runCircleBuild (ctx: IContext, digSpot: string, baseBranch: string) {
  ctx.logger.info(`Triggering CircleCI to run dig on for target: ${digSpot}`);
  const buildRequest: Record<string, Record<string, string>> = {
    build_parameters: {
      DIG_SPOT: digSpot,
      CIRCLE_JOB: 'dig',
      BASE_BRANCH: baseBranch
    },
  };

  const response = await fetch(
    `https://circleci.com/api/v1.1/project/github/${REPO_SLUG}/tree/master?circle-token=${CIRCLE_TOKEN}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(buildRequest)
    },
  );

  const buildInfo = await response.json();

  return parseInt(buildInfo.build_url.split('/').pop(), 10);
}
