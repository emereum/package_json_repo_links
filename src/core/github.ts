import { RepoInfo } from './repo';

/** Returns true when the URL exists (e.g. HEAD request returns 2xx). */
export type UrlChecker = (url: string) => Promise<boolean>;

/**
 * Conventional tag names to try, in order of likelihood:
 *   v1.2.3, 1.2.3, @scope/pkg@1.2.3 (lerna/changesets style), pkg@1.2.3.
 */
export function tagCandidates(name: string, version: string): string[] {
  const candidates = [`v${version}`, version, `${name}@${version}`];
  const unscoped = name.includes('/') ? name.split('/')[1] : undefined;
  if (unscoped) {
    candidates.push(`${unscoped}@${version}`);
  }
  return candidates;
}

export interface GitHubUrlOptions {
  repo: RepoInfo;
  name: string;
  /** Exact installed version; when unknown the default branch is used. */
  version?: string;
  /** Commit the version was published from, used when no tag matches. */
  gitHead?: string;
  checkUrl: UrlChecker;
}

/**
 * Builds the best GitHub URL for a package version:
 *  1. source tree at a matching release tag (v1.2.3 / 1.2.3 / pkg@1.2.3),
 *  2. source tree at the publish commit (registry gitHead),
 *  3. the repository's default branch.
 * repository.directory is appended so monorepo packages land on their folder.
 */
export async function buildGitHubUrl(options: GitHubUrlOptions): Promise<string> {
  const { repo, name, version, gitHead, checkUrl } = options;
  if (repo.host !== 'github' || !repo.owner || !repo.repo) {
    return repo.url;
  }

  const base = `https://github.com/${repo.owner}/${repo.repo}`;
  const directorySuffix = repo.directory ? `/${encodeRefPath(repo.directory)}` : '';

  if (version) {
    for (const tag of tagCandidates(name, version)) {
      const tagUrl = `${base}/tree/${encodeRefPath(tag)}`;
      if (await checkUrl(tagUrl)) {
        return tagUrl + directorySuffix;
      }
    }
    if (gitHead) {
      const commitUrl = `${base}/tree/${gitHead}`;
      if (await checkUrl(commitUrl)) {
        return commitUrl + directorySuffix;
      }
    }
  }

  // Default branch. HEAD resolves to it in GitHub tree URLs.
  return repo.directory ? `${base}/tree/HEAD${directorySuffix}` : base;
}

/** Percent-encodes a ref or path for a GitHub URL, preserving '/' separators. */
function encodeRefPath(refOrPath: string): string {
  return refOrPath.split('/').map(encodeURIComponent).join('/');
}
