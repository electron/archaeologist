import { cyan, red } from 'colors';
import { ILogger } from './types';

export class Logger implements ILogger {
  constructor(private id: string) {}

  info = (...args: any[]) => {
    console.info(cyan(`[${this.id}]:`), ...args)
  }

  error = (...args: any[]) => {
    console.error(cyan(`[${this.id}]:`), ...args)
  }
}