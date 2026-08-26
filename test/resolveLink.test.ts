import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { resolveDependencyLink } from '../src/core/resolveLink';

const fixtures = path.resolve(__dirname, '../../test/fixtures');

test('end to end: pnpm lockfile version + registry repository + tag probing', async () => {
  const packageJsonPath = path.join(fixtures, 'pnpm-monorepo/package.json');
  const registryCalls: string[] = [];

  const result = await resolveDependencyLink(packageJsonPath, 'react', '^18.2.0', {
    fetchJson: async (url) => {
      registryCalls.push(url);
      return {
        repository: { type: 'git', url: 'git+https://github.com/facebook/react.git' },
        gitHead: 'feedface',
      };
    },
    checkUrl: async (url) => url === 'https://github.com/facebook/react/tree/v18.3.1',
  });

  // Lockfile-resolved version (18.3.1), not the declared range (^18.2.0).
  assert.equal(result.version, '18.3.1');
  assert.equal(result.url, 'https://github.com/facebook/react/tree/v18.3.1');
  assert.deepEqual(registryCalls, ['https://registry.npmjs.org/react/18.3.1']);
});

test('end to end: scoped package, no matching tag, falls back to registry gitHead commit', async () => {
  const packageJsonPath = path.join(fixtures, 'npm-monorepo/packages/app/package.json');

  const result = await resolveDependencyLink(packageJsonPath, '@babel/core', '^7.24.0', {
    fetchJson: async (url) => {
      assert.equal(url, 'https://registry.npmjs.org/@babel%2Fcore/7.24.7');
      return {
        repository: {
          type: 'git',
          url: 'https://github.com/babel/babel.git',
          directory: 'packages/babel-core',
        },
        gitHead: 'abc123',
      };
    },
    checkUrl: async (url) => url === 'https://github.com/babel/babel/tree/abc123',
  });

  assert.equal(result.version, '7.24.7');
  assert.equal(result.url, 'https://github.com/babel/babel/tree/abc123/packages/babel-core');
});

test('end to end: prefers locally installed repository metadata over the registry', async () => {
  const packageJsonPath = path.join(fixtures, 'installed/package.json');

  const result = await resolveDependencyLink(packageJsonPath, '@scope/pkg', '^2.0.0', {
    fetchJson: async () => undefined,
    checkUrl: async (url) => url === 'https://github.com/scope-org/monorepo/tree/%40scope/pkg%402.5.0',
  });

  // Version comes from the installed node_modules manifest (no lockfile in fixture).
  assert.equal(result.version, '2.5.0');
  assert.equal(result.url, 'https://github.com/scope-org/monorepo/tree/%40scope/pkg%402.5.0/packages/pkg');
});

test('end to end: no repository anywhere falls back to the npm page', async () => {
  const packageJsonPath = path.join(fixtures, 'npm-monorepo/packages/app/package.json');

  const result = await resolveDependencyLink(packageJsonPath, 'lodash', '^3.10.0', {
    fetchJson: async () => undefined,
    checkUrl: async () => false,
  });

  assert.equal(result.url, 'https://www.npmjs.com/package/lodash');
  assert.equal(result.version, '3.10.1');
});
