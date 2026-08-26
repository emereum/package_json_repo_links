import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { resolveFromNpmLock, resolveInstalledVersion } from '../src/core/lockfiles';

const fixtures = path.resolve(__dirname, '../../test/fixtures');
const monorepo = path.join(fixtures, 'npm-monorepo');
const appDir = path.join(monorepo, 'packages/app');

test('npm v3: resolves hoisted dependency for a workspace package', async () => {
  assert.deepEqual(await resolveInstalledVersion(appDir, 'react', '^18.2.0'), {
    version: '18.3.1',
    source: 'npm',
  });
});

test('npm v3: resolves scoped packages', async () => {
  const result = await resolveInstalledVersion(appDir, '@babel/core', '^7.24.0');
  assert.equal(result?.version, '7.24.7');
});

test('npm v3: prefers workspace-nested node_modules over the hoisted copy', async () => {
  const result = await resolveInstalledVersion(appDir, 'lodash', '^3.10.0');
  assert.equal(result?.version, '3.10.1');
});

test('npm v3: follows workspace symlinks to the linked package version', async () => {
  const result = await resolveInstalledVersion(appDir, 'local-lib', '*');
  assert.equal(result?.version, '1.2.0');
});

test('npm v1: falls back to the dependencies tree', () => {
  const v1Lock = JSON.stringify({
    lockfileVersion: 1,
    dependencies: {
      'left-pad': { version: '1.3.0' },
      '@scope/thing': { version: '0.9.1' },
    },
  });
  assert.equal(resolveFromNpmLock(v1Lock, '', 'left-pad'), '1.3.0');
  assert.equal(resolveFromNpmLock(v1Lock, '', '@scope/thing'), '0.9.1');
  assert.equal(resolveFromNpmLock(v1Lock, '', 'missing'), undefined);
});

test('npm: tolerates malformed lockfiles', () => {
  assert.equal(resolveFromNpmLock('not json', '', 'react'), undefined);
});
