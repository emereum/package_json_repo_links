import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildGitHubUrl, tagCandidates } from '../src/core/github';
import { RepoInfo } from '../src/core/repo';

const repo: RepoInfo = { host: 'github', owner: 'owner', repo: 'repo', url: 'https://github.com/owner/repo' };

function checkerFor(...existing: string[]) {
  const checked: string[] = [];
  const check = async (url: string) => {
    checked.push(url);
    return existing.includes(url);
  };
  return { check, checked };
}

test('tag candidates cover v-prefix, bare, and name@version forms (plus unscoped)', () => {
  assert.deepEqual(tagCandidates('pkg', '1.2.3'), ['v1.2.3', '1.2.3', 'pkg@1.2.3']);
  assert.deepEqual(tagCandidates('@scope/pkg', '1.2.3'), [
    'v1.2.3',
    '1.2.3',
    '@scope/pkg@1.2.3',
    'pkg@1.2.3',
  ]);
});

test('uses the v-prefixed tag when it exists', async () => {
  const { check } = checkerFor('https://github.com/owner/repo/tree/v1.2.3');
  const url = await buildGitHubUrl({ repo, name: 'pkg', version: '1.2.3', checkUrl: check });
  assert.equal(url, 'https://github.com/owner/repo/tree/v1.2.3');
});

test('falls back through tag forms to name@version', async () => {
  const { check, checked } = checkerFor('https://github.com/owner/repo/tree/pkg%401.2.3');
  const url = await buildGitHubUrl({ repo, name: 'pkg', version: '1.2.3', checkUrl: check });
  assert.equal(url, 'https://github.com/owner/repo/tree/pkg%401.2.3');
  assert.deepEqual(checked, [
    'https://github.com/owner/repo/tree/v1.2.3',
    'https://github.com/owner/repo/tree/1.2.3',
    'https://github.com/owner/repo/tree/pkg%401.2.3',
  ]);
});

test('tries the full scoped name tag for scoped packages', async () => {
  const { check } = checkerFor('https://github.com/owner/repo/tree/%40scope/pkg%401.2.3');
  const url = await buildGitHubUrl({ repo, name: '@scope/pkg', version: '1.2.3', checkUrl: check });
  assert.equal(url, 'https://github.com/owner/repo/tree/%40scope/pkg%401.2.3');
});

test('falls back to the publish commit when no tag exists', async () => {
  const { check } = checkerFor('https://github.com/owner/repo/tree/abc1234def');
  const url = await buildGitHubUrl({
    repo,
    name: 'pkg',
    version: '1.2.3',
    gitHead: 'abc1234def',
    checkUrl: check,
  });
  assert.equal(url, 'https://github.com/owner/repo/tree/abc1234def');
});

test('falls back to the repository default branch when nothing matches', async () => {
  const { check } = checkerFor();
  const url = await buildGitHubUrl({
    repo,
    name: 'pkg',
    version: '1.2.3',
    gitHead: 'deadbeef',
    checkUrl: check,
  });
  assert.equal(url, 'https://github.com/owner/repo');
});

test('appends the monorepo directory to tag and fallback URLs', async () => {
  const monorepo: RepoInfo = { ...repo, directory: 'packages/pkg' };

  const hit = checkerFor('https://github.com/owner/repo/tree/pkg%401.2.3');
  assert.equal(
    await buildGitHubUrl({ repo: monorepo, name: 'pkg', version: '1.2.3', checkUrl: hit.check }),
    'https://github.com/owner/repo/tree/pkg%401.2.3/packages/pkg'
  );

  const miss = checkerFor();
  assert.equal(
    await buildGitHubUrl({ repo: monorepo, name: 'pkg', version: '1.2.3', checkUrl: miss.check }),
    'https://github.com/owner/repo/tree/HEAD/packages/pkg'
  );
});

test('unknown version goes straight to the default branch without probing', async () => {
  const { check, checked } = checkerFor();
  const url = await buildGitHubUrl({ repo, name: 'pkg', checkUrl: check });
  assert.equal(url, 'https://github.com/owner/repo');
  assert.deepEqual(checked, []);
});

test('non-GitHub repositories return their plain URL', async () => {
  const { check, checked } = checkerFor();
  const url = await buildGitHubUrl({
    repo: { host: 'other', url: 'https://gitlab.com/owner/repo' },
    name: 'pkg',
    version: '1.2.3',
    checkUrl: check,
  });
  assert.equal(url, 'https://gitlab.com/owner/repo');
  assert.deepEqual(checked, []);
});
