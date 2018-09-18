import { Context } from 'probot';

type LogMethod = (...messages: string[]) => void;

export interface ILogger {
  info: LogMethod;
  error: LogMethod;
}

export interface IContext {
  logger: ILogger;
  bot: Context;
}