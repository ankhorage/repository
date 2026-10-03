import { expect, test } from 'bun:test';

import { parseMaterializeCommandOptions } from './parseMaterializeCommandOptions.js';

test('parses the repository URL, ref, and output path', () => {
  expect(
    parseMaterializeCommandOptions([
      'https://github.com/ankhorage/zora',
      '--ref',
      'main',
      '--out',
      './zora',
    ]),
  ).toEqual({
    repositoryUrl: 'https://github.com/ankhorage/zora',
    ref: 'main',
    destinationPath: './zora',
  });
});

test('requires exactly one repository URL', () => {
  expect(() => parseMaterializeCommandOptions([])).toThrow('repository URL is required');
  expect(() =>
    parseMaterializeCommandOptions([
      'https://github.com/ankhorage/zora',
      'https://github.com/ankhorage/surface',
    ]),
  ).toThrow('Only one GitHub repository URL');
});
