import { CIRCLE_TOKEN, REPO_SLUG } from './constants';
import { IContext } from '../types';
import { nodeFetch } from '../fetch';
import { Context } from 'probot';

type CirclePipelineStatus = 'created' | 'errored' | 'setup-pending' | 'setup' | 'pending';

type CirclePipeline = {
  id: string;
  state: CirclePipelineStatus;
  number: number;
  created_at: string;
};

type CircleWorkflow = {
  id: string;
};

export type CircleJob = {
  job_number: number;
  id: string;
  status: 'success' | 'failed' | 'running';
};

export async function runCircleBuild(
  ctx: Context,
  digSpot: string,
  baseBranch: string,
  additionalRemote: string,
) {
  ctx.log.info(`Triggering CircleCI to run dig on for target: ${digSpot}`);
  const buildRequest: Record<string, string | Record<string, string | boolean>> = {
    branch: 'main',
    parameters: {
      dig_spot: digSpot,
      base_branch: baseBranch,
      additional_remote: additionalRemote,
      should_dig: true,
    },
  };

  const response = await nodeFetch(`https://circleci.com/api/v2/project/gh/${REPO_SLUG}/pipeline`, {
    method: 'POST',
    headers: {
      'Circle-Token': CIRCLE_TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(buildRequest),
  });

  let buildInfo: CirclePipeline = (await response.json()) as any;

  while (buildInfo.state !== 'created') {
    await new Promise((r) => setTimeout(r, 5000));

    const buildInfoPoll = await nodeFetch(`https://circleci.com/api/v2/pipeline/${buildInfo.id}`, {
      headers: {
        'Circle-Token': CIRCLE_TOKEN,
      },
    });
    buildInfo = (await buildInfoPoll.json()) as any;
  }

  const workflowsResponse = await nodeFetch(
    `https://circleci.com/api/v2/pipeline/${buildInfo.id}/workflow`,
    {
      headers: {
        'Circle-Token': CIRCLE_TOKEN,
      },
    },
  );
  const workflows: CircleWorkflow[] = ((await workflowsResponse.json()) as any).items;
  const singleWorkflow = workflows[0];

  const jobsResponse = await nodeFetch(
    `https://circleci.com/api/v2/workflow/${singleWorkflow.id}/job`,
    {
      headers: {
        'Circle-Token': CIRCLE_TOKEN,
      },
    },
  );
  const jobs: CircleJob[] = ((await jobsResponse.json()) as any).items;

  return jobs[0].job_number;
}
