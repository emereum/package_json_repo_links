import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface RepoInfo {
  /** Only GitHub gets tag-aware links; other hosts open the plain URL. */
  host: 'github' | 'other';
  owner?: string;
  repo?: string;
  /** Subdirectory within a monorepo, from repository.directory. */
  directory?: string;
  /** Browsable base URL, e.g. https://github.com/owner/repo */
  url: string;
}

export interface PackageMeta {
  repository?: RepoInfo;
  /** Exact commit the version was published from, when the registry knows it. */
  gitHead?: string;
}

export type JsonFetcher = (url: string) => Promise<any | undefined>;

/**
 * Normalizes the many shapes of package.json "repository" fields into a
 * browsable URL, detecting GitHub owner/repo when possible.
 *
 * Handles: {type, url, directory} objects, plain URL strings, "owner/repo"
 * shorthand, "github:owner/repo", git+https/git/ssh protocols and
 * "git@github.com:owner/repo.git".
 */
export function normalizeRepository(repository: unknown): RepoInfo | undefined {
  let url: string | undefined;
  let directory: string | undefined;

  if (typeof repository === 'string') {
    url = repository;
  } else if (repository && typeof repository === 'object') {
    const record = repository as Record<string, unknown>;
    if (typeof record.url === 'string') {
      url = record.url;
    }
    if (typeof record.directory === 'string') {
      directory = record.directory.replace(/^\/+|\/+$/g, '') || undefined;
    }
  }
  if (!url) {
    return undefined;
  }

  // npm shorthand forms: "owner/repo", "github:owner/repo", "gitlab:owner/repo", ...
  const shorthand = url.match(/^(?:(github|gitlab|bitbucket):)?([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (shorthand && !url.includes(':/') && !url.startsWith('git@')) {
    const [, hostPrefix, owner, repo] = shorthand;
    if (!hostPrefix || hostPrefix === 'github') {
      return { host: 'github', owner, repo, directory, url: `https://github.com/${owner}/${repo}` };
    }
    const hostName = hostPrefix === 'gitlab' ? 'gitlab.com' : 'bitbucket.org';
    return { host: 'other', directory, url: `https://${hostName}/${owner}/${repo}` };
  }

  let normalized = url.replace(/^git\+/, '');
  // scp-like syntax: git@github.com:owner/repo.git
  const scpLike = normalized.match(/^git@([^:]+):(.+)$/);
  if (scpLike) {
    normalized = `https://${scpLike[1]}/${scpLike[2]}`;
  }
  normalized = normalized.replace(/^(git|ssh):\/\//, 'https://').replace(/^https:\/\/git@/, 'https://');

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return undefined;
  }

  if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const owner = segments[0];
      const repo = segments[1].replace(/\.git$/, '');
      return { host: 'github', owner, repo, directory, url: `https://github.com/${owner}/${repo}` };
    }
  }

  return {
    host: 'other',
    directory,
    url: `https://${parsed.host}${parsed.pathname.replace(/\.git$/, '')}`,
  };
}

/**
 * Reads repository metadata from the locally installed copy of the package
 * (node_modules/<name>/package.json), walking up from the package dir.
 */
export async function readInstalledPackageMeta(packageDir: string, name: string): Promise<PackageMeta | undefined> {
  let dir = path.resolve(packageDir);
  for (;;) {
    const manifestPath = path.join(dir, 'node_modules', ...name.split('/'), 'package.json');
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      const repository = normalizeRepository(manifest.repository);
      if (repository) {
        return {
          repository,
          gitHead: typeof manifest.gitHead === 'string' ? manifest.gitHead : undefined,
        };
      }
    } catch {
      // missing or unparsable: keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Fetches repository metadata (and the published gitHead commit) for a
 * specific version from the npm registry.
 */
export async function fetchRegistryMeta(
  name: string,
  version: string | undefined,
  fetchJson: JsonFetcher
): Promise<PackageMeta | undefined> {
  // Scoped names must be encoded as @scope%2Fname in registry URLs.
  const encodedName = name.replace('/', '%2F');
  const manifest = await fetchJson(`https://registry.npmjs.org/${encodedName}/${version ?? 'latest'}`);
  if (!manifest || typeof manifest !== 'object') {
    return undefined;
  }
  return {
    repository: normalizeRepository(manifest.repository),
    gitHead: typeof manifest.gitHead === 'string' ? manifest.gitHead : undefined,
  };
}
