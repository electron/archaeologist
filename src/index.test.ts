import { describe, it, expect } from 'vitest';
import { stripVersion } from './index.js';

describe('stripVersion', () => {
  it('should remove version line from TypeScript definitions', () => {
    const input = `Type definitions for Electron 1.2.3
interface Foo {
  bar: string;
}`;
    const expected = `interface Foo {
  bar: string;
}`;
    expect(stripVersion(input)).toBe(expected);
  });

  it('should handle multiple version lines', () => {
    const input = `Type definitions for Electron 1.2.3
interface Foo {
  bar: string;
}
Type definitions for Electron 2.0.0
interface Baz {}`;
    const expected = `interface Foo {
  bar: string;
}
interface Baz {}`;
    expect(stripVersion(input)).toBe(expected);
  });

  it('should return unchanged string if no version line present', () => {
    const input = `interface Foo {
  bar: string;
}`;
    expect(stripVersion(input)).toBe(input);
  });

  it('should handle empty string', () => {
    expect(stripVersion('')).toBe('');
  });
});
