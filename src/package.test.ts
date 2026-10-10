import { areCapabilitiesEqual, isCapability } from '@ankhorage/capability';
import { describe, expect, test } from 'bun:test';

import packageJson from '../package.json';
import { CAPABILITIES } from './capabilities/index.js';

describe('package metadata', () => {
  test('publishes the canonical capability catalog and public capability entrypoint', () => {
    expect(packageJson.ankh.capabilities).toHaveLength(CAPABILITIES.length);
    expect(packageJson.ankh.capabilities.every(isCapability)).toBeTrue();
    expect(packageJson.ankh.capabilities.map((capability) => JSON.stringify(capability))).toEqual(
      CAPABILITIES.map((capability) => JSON.stringify(capability)),
    );
    expect(packageJson.exports['./capabilities']).toEqual({
      types: './dist/capabilities/index.d.ts',
      default: './dist/capabilities/index.js',
    });
  });

  test('does not publish legacy string-only capabilities', () => {
    for (const [index, capability] of CAPABILITIES.entries()) {
      const published = packageJson.ankh.capabilities.at(index);
      if (published === undefined) throw new Error('Published capability metadata is incomplete.');
      if (!isCapability(published)) throw new Error('Published capability metadata is invalid.');
      expect(typeof published).toBe('object');
      expect(areCapabilitiesEqual(published, capability)).toBeTrue();
    }
  });
});
