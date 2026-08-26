import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { cleanPnpmVersion, resolveFromPnpmLock, resolveInstalledVersion } from '../src/core/lockfiles';

const fixtures = path.resolve(__dirname, '../../test/fixtures');
const monorepo = path.join(fixtures, 'pnpm-monorepo');

test('pnpm v9: resolves root importer dependency and devDependency', async () => {
  assert.deepEqual(await resolveInstalledVersion(monorepo, 'react', '^18.2.0'), {
    version: '18.3.1',
    source: 'pnpm',
  });
  assert.deepEqual(await resolveInstalledVersion(monorepo, 'typescript', '^5.4.0'), {
    version: '5.5.4',
    source: 'pnpm',
  });
});

test('pnpm v9: resolves workspace package deps via importer path, walking up to the lockfile', async () => {
  const appDir = path.join(monorepo, 'packages/app');
  assert.deepEqual(await resolveInstalledVersion(appDir, '@babel/core', '^7.24.0'), {
    version: '7.24.7',
    source: 'pnpm',
  });
});

test('pnpm v9: strips peer-dependency suffixes', async () => {
  const appDir = path.join(monorepo, 'packages/app');
  const result = await resolveInstalledVersion(appDir, 'styled-components', '^6.1.0');
  assert.equal(result?.version, '6.1.11');
});

test('pnpm v9: resolves npm: alias to the aliased package version', async () => {
  const appDir = path.join(monorepo, 'packages/app');
  const result = await resolveInstalledVersion(appDir, 'my-alias', 'npm:lodash@^4.17.0');
  assert.equal(result?.version, '4.17.21');
});

test('pnpm v9: workspace link: deps produce no version', async () => {
  const appDir = path.join(monorepo, 'packages/app');
  assert.equal(await resolveInstalledVersion(appDir, 'local-lib', 'workspace:*'), undefined);
});

const v6Lock = `
lockfileVersion: '6.0'

dependencies:
  '@types/node':
    specifier: ^20.0.0
    version: 20.14.9
  express:
    specifier: ^4.19.0
    version: 4.19.2

devDependencies:
  vitest:
    specifier: ^1.6.0
    version: 1.6.0(@types/node@20.14.9)
`;

test('pnpm v6: resolves from top-level sections without importers', () => {
  assert.equal(resolveFromPnpmLock(v6Lock, '', 'express'), '4.19.2');
  assert.equal(resolveFromPnpmLock(v6Lock, '', '@types/node'), '20.14.9');
  assert.equal(resolveFromPnpmLock(v6Lock, '', 'vitest'), '1.6.0');
  assert.equal(resolveFromPnpmLock(v6Lock, '', 'missing'), undefined);
});

test('cleanPnpmVersion handles the various lockfile version encodings', () => {
  assert.equal(cleanPnpmVersion('1.2.3'), '1.2.3');
  assert.equal(cleanPnpmVersion('1.2.3(react@18.2.0)(react-dom@18.2.0)'), '1.2.3');
  assert.equal(cleanPnpmVersion('1.2.3_react@18.2.0'), '1.2.3');
  assert.equal(cleanPnpmVersion('/lodash@4.17.21'), '4.17.21');
  assert.equal(cleanPnpmVersion('/@scope/pkg@2.0.0'), '2.0.0');
  assert.equal(cleanPnpmVersion('lodash@4.17.21'), '4.17.21');
  assert.equal(cleanPnpmVersion('link:../lib'), undefined);
  assert.equal(cleanPnpmVersion('workspace:*'), undefined);
});
