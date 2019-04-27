import { cyan } from 'colors';
import { ILogger } from './types';

export class Logger implements ILogger {
  constructor(private id: string) {}

  info = (...args) => {
    console.info(cyan(`[${this.id}]:`), ...args)
  }

  error = (...args) => {
    console.error(cyan(`[${this.id}]:`), ...args)
  }
}