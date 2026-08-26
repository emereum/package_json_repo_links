import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { normalizeRepository, readInstalledPackageMeta } from '../src/core/repo';

test('normalizes git+https URLs', () => {
  const repo = normalizeRepository({ type: 'git', url: 'git+https://github.com/facebook/react.git' });
  assert.deepEqual(repo, {
    host: 'github',
    owner: 'facebook',
    repo: 'react',
    directory: undefined,
    url: 'https://github.com/facebook/react',
  });
});

test('normalizes git:// and ssh:// URLs', () => {
  assert.equal(
    normalizeRepository('git://github.com/lodash/lodash.git')?.url,
    'https://github.com/lodash/lodash'
  );
  assert.equal(
    normalizeRepository('ssh://git@github.com/owner/repo.git')?.url,
    'https://github.com/owner/repo'
  );
});

test('normalizes scp-like git@ URLs', () => {
  const repo = normalizeRepository('git@github.com:sindresorhus/got.git');
  assert.equal(repo?.owner, 'sindresorhus');
  assert.equal(repo?.repo, 'got');
});

test('normalizes shorthand forms', () => {
  assert.equal(normalizeRepository('isaacs/rimraf')?.url, 'https://github.com/isaacs/rimraf');
  assert.equal(normalizeRepository('github:owner/repo')?.owner, 'owner');
  assert.equal(normalizeRepository('gitlab:owner/repo')?.url, 'https://gitlab.com/owner/repo');
  assert.equal(normalizeRepository('gitlab:owner/repo')?.host, 'other');
});

test('preserves monorepo directory', () => {
  const repo = normalizeRepository({
    type: 'git',
    url: 'https://github.com/babel/babel.git',
    directory: 'packages/babel-core',
  });
  assert.equal(repo?.directory, 'packages/babel-core');
});

test('non-GitHub hosts are kept as plain URLs', () => {
  const repo = normalizeRepository('https://gitlab.com/gitlab-org/gitlab.git');
  assert.equal(repo?.host, 'other');
  assert.equal(repo?.url, 'https://gitlab.com/gitlab-org/gitlab');
});

test('returns undefined for missing or garbage input', () => {
  assert.equal(normalizeRepository(undefined), undefined);
  assert.equal(normalizeRepository({}), undefined);
  assert.equal(normalizeRepository('not a url at all %%%'), undefined);
});

test('reads repository metadata from installed scoped packages', async () => {
  const fixtureDir = path.resolve(__dirname, '../../test/fixtures/installed');
  const meta = await readInstalledPackageMeta(fixtureDir, '@scope/pkg');
  assert.equal(meta?.repository?.owner, 'scope-org');
  assert.equal(meta?.repository?.repo, 'monorepo');
  assert.equal(meta?.repository?.directory, 'packages/pkg');
});
