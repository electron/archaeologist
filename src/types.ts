import { Context } from 'actions-toolkit/lib/context';

type LogMethod = (...messages: string[]) => void;

export interface ILogger {
  info: LogMethod;
  error: LogMethod;
}

export interface IContext {
  logger: ILogger;
  bot: Context;
}