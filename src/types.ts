import { Context } from 'probot';

type LogMethod = (...messages: string[]) => void;

export interface ILogger {
  info: LogMethod;
  error: LogMethod;
}

export type PRContext = Context<
  'pull_request.opened' | 'pull_request.reopened' | 'pull_request.synchronize'
>;

export type PR = PRContext['payload']['pull_request'];
export interface IContext {
  logger: ILogger;
  bot: PRContext;
}

export enum CheckRunStatus {
  NEUTRAL = 'neutral',
  FAILURE = 'failure',
  SUCCESS = 'success',
}

export type CheckStatus = {
  conclusion: CheckRunStatus;
  title: string;
  summary: string;
};
