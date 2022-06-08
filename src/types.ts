import { Context } from 'probot';

type LogMethod = (...messages: string[]) => void;

export interface ILogger {
  info: LogMethod;
  error: LogMethod;
}

export type PRContext = Context<'pull_request.opened' | 'pull_request.reopened' | 'pull_request.synchronize'>;

export interface IContext {
  logger: ILogger;
  bot: PRContext;
}