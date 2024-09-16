import { Context } from 'probot';
import { nodeFetch } from '../fetch';

import { CIRCLE_TOKEN, REPO_SLUG } from './constants';
import { CircleJob } from './run';

const CHECK_INTERVAL = 5000;
const ALLOWED_FAILURES = 3;

enum CheckStatus {
  BUILD_PASSED,
  BUILD_FAILED,
  BUILD_RUNNING,
}

/**
 * Waits for a build success.
 *
 * @template T
 * @param {IContext} ctx
 * @param {string} url
 * @param {RequestInit} opts
 * @param {(response: T) => boolean} checker
 */
async function waitForSuccess<T>(
  ctx: Context,
  url: string,
  opts: Parameters<typeof nodeFetch>[1],
  checker: (response: T) => CheckStatus,
) {
  return await new Promise<boolean>((resolve, reject) => {
    let allowedFailures = ALLOWED_FAILURES;
    const run = () => {
      ctx.log.info(`Waiter Pinging: ${url}`);
      nodeFetch(url, opts)
        .then((r) => r.json() as any)
        .then((response: T) => {
          switch (checker(response)) {
            case CheckStatus.BUILD_PASSED:
              ctx.log.info(`Waiter Success: ${url}`);
              return resolve(true);
            case CheckStatus.BUILD_FAILED:
              ctx.log.info(`Waiter Failed: ${url}`);
              return resolve(false);
            case CheckStatus.BUILD_RUNNING:
              setTimeout(run, CHECK_INTERVAL);
          }
        })
        .catch((err) => {
          ctx.log.error(`Waiter Error: ${url}`, err);
          if (allowedFailures <= 0) return resolve(false);
          allowedFailures -= 1;
          setTimeout(run, CHECK_INTERVAL);
        });
    };
    run();
  });
}

/**
 * Wait for circle to finish a build.
 *
 * @param {Context} ctx
 * @param {CircleBuild} build
 */
export async function waitForCircle(ctx: Context, buildNumber: number) {
  return await waitForSuccess<any>(
    ctx,
    `https://circleci.com/api/v2/project/gh/${REPO_SLUG}/job/${buildNumber}`,
    {
      method: 'GET',
      headers: {
        'Circle-Token': CIRCLE_TOKEN,
      },
    },
    (d: CircleJob) => {
      if (d.status === 'success') return CheckStatus.BUILD_PASSED;
      if (d.status === 'failed') return CheckStatus.BUILD_FAILED;
      return CheckStatus.BUILD_RUNNING;
    },
  );
}
