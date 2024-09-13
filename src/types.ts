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

export type ArtifactsInfo = {
  missing: string[];
  old: string | null;
  new: string | null;
  oldDigSpot: string | null;
};
