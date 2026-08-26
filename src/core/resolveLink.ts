import * as path from 'node:path';
import { resolveInstalledVersion } from './lockfiles';
import { buildGitHubUrl, UrlChecker } from './github';
import { fetchRegistryMeta, JsonFetcher, PackageMeta, readInstalledPackageMeta } from './repo';

export interface ResolveEnvironment {
  fetchJson: JsonFetcher;
  checkUrl: UrlChecker;
}

export interface ResolvedLink {
  url: string;
  /** Exact version the link points at, when one could be determined. */
  version?: string;
}

/**
 * Resolves the URL a dependency name in package.json should open:
 * exact installed version from the lockfile, repository from installed or
 * registry metadata, then the best matching GitHub tag/commit/branch URL.
 */
export async function resolveDependencyLink(
  packageJsonPath: string,
  name: string,
  declaredRange: string,
  env: ResolveEnvironment
): Promise<ResolvedLink> {
  const packageDir = path.dirname(packageJsonPath);

  const installed = await resolveInstalledVersion(packageDir, name, declaredRange);
  const version = installed?.version;

  let meta: PackageMeta | undefined = await readInstalledPackageMeta(packageDir, name);
  // The registry knows the publish commit (gitHead); installed manifests
  // usually don't. Prefer local metadata for the repository but fill in the
  // rest from the registry when needed.
  if (!meta?.repository || !meta.gitHead) {
    const registryMeta = await fetchRegistryMeta(name, version, env.fetchJson).catch(() => undefined);
    meta = {
      repository: meta?.repository ?? registryMeta?.repository,
      gitHead: meta?.gitHead ?? registryMeta?.gitHead,
    };
  }

  if (!meta.repository) {
    // No repository anywhere: at least open the npm page for the package.
    return { url: `https://www.npmjs.com/package/${name}`, version };
  }

  const url = await buildGitHubUrl({
    repo: meta.repository,
    name,
    version,
    gitHead: meta.gitHead,
    checkUrl: env.checkUrl,
  });
  return { url, version };
}
