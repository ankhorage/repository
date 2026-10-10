import { isCapability } from '@ankhorage/capability';
import { describe, expect, test } from 'bun:test';

import { CAPABILITIES } from './index.js';

describe('Repository capabilities', () => {
  test('contains unique canonical descriptors for every externally invokable operation', () => {
    expect(CAPABILITIES).toHaveLength(2);
    expect(CAPABILITIES.every(isCapability)).toBeTrue();
    expect(new Set(CAPABILITIES.map(({ id }) => id)).size).toBe(CAPABILITIES.length);
    for (const capability of CAPABILITIES) {
      expect(capability.owner).toBe('@ankhorage/repository');
      expect(capability.access).toEqual(['invoke']);
      expect(capability.binding).toEqual({ kind: 'action', bindableAs: ['target'] });
    }
  });
});
