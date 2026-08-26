import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as YAML from 'yaml';

export type VersionSource = 'pnpm' | 'npm' | 'yarn' | 'node_modules';

export interface InstalledVersion {
  version: string;
  source: VersionSource;
}

/**
 * Resolves the exact installed version of a dependency for the package.json
 * located in `packageDir`, by walking up the directory tree until a lockfile
 * (pnpm-lock.yaml, package-lock.json or yarn.lock) is found. Falls back to
 * reading node_modules/<name>/package.json.
 */
export async function resolveInstalledVersion(
  packageDir: string,
  name: string,
  declaredRange: string
): Promise<InstalledVersion | undefined> {
  let dir = path.resolve(packageDir);
  for (;;) {
    const pnpmLock = await readFileIfExists(path.join(dir, 'pnpm-lock.yaml'));
    if (pnpmLock !== undefined) {
      const relDir = toPosixRelative(dir, packageDir);
      const version = resolveFromPnpmLock(pnpmLock, relDir, name);
      if (version) {
        return { version, source: 'pnpm' };
      }
    }

    const npmLock = await readFileIfExists(path.join(dir, 'package-lock.json'));
    if (npmLock !== undefined) {
      const relDir = toPosixRelative(dir, packageDir);
      const version = resolveFromNpmLock(npmLock, relDir, name);
      if (version) {
        return { version, source: 'npm' };
      }
    }

    const yarnLock = await readFileIfExists(path.join(dir, 'yarn.lock'));
    if (yarnLock !== undefined) {
      const version = resolveFromYarnLock(yarnLock, name, declaredRange);
      if (version) {
        return { version, source: 'yarn' };
      }
    }

    // Stop walking up once we found any lockfile: it defines the install root.
    if (pnpmLock !== undefined || npmLock !== undefined || yarnLock !== undefined) {
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  const fromNodeModules = await resolveFromNodeModules(packageDir, name);
  if (fromNodeModules) {
    return { version: fromNodeModules, source: 'node_modules' };
  }
  return undefined;
}

async function readFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

/** Relative path from the lockfile dir to the package dir, in posix form ('' for same dir). */
function toPosixRelative(lockfileDir: string, packageDir: string): string {
  return path.relative(lockfileDir, path.resolve(packageDir)).split(path.sep).join('/');
}

// --- pnpm ---------------------------------------------------------------

/**
 * Resolves a dependency version from a pnpm-lock.yaml. Supports lockfile
 * versions 5.x (underscore peer suffixes), 6.x (top-level sections or
 * importers) and 9.x (importers), including workspace/monorepo importer
 * paths and npm: aliases.
 */
export function resolveFromPnpmLock(lockText: string, relDir: string, name: string): string | undefined {
  let doc: any;
  try {
    doc = YAML.parse(lockText);
  } catch {
    return undefined;
  }
  if (!doc || typeof doc !== 'object') {
    return undefined;
  }

  const importerKey = relDir === '' ? '.' : relDir;
  const container = doc.importers ? doc.importers[importerKey] : doc;
  if (!container || typeof container !== 'object') {
    return undefined;
  }

  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const entry = container[section]?.[name];
    if (entry === undefined || entry === null) {
      continue;
    }
    const raw = typeof entry === 'string' ? entry : entry.version;
    const version = cleanPnpmVersion(raw);
    if (version) {
      return version;
    }
  }
  return undefined;
}

/**
 * Normalizes a pnpm lockfile version string to a plain semver version.
 * Handles peer-dependency suffixes ("1.2.3(react@18.2.0)" and "1.2.3_react@18.2.0")
 * and npm: aliases ("/react@18.2.0", "/@scope/pkg@1.2.3").
 */
export function cleanPnpmVersion(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined;
  }
  if (raw.startsWith('link:') || raw.startsWith('file:') || raw.startsWith('workspace:')) {
    return undefined;
  }
  // Strip pnpm v6+/v9 peer suffix: "1.2.3(react@18.2.0)(...)"
  let version = raw.replace(/\(.*$/s, '');
  if (/^\d/.test(version)) {
    // Strip pnpm v5 peer suffix: "1.2.3_react@18.2.0"
    return version.split('_')[0];
  }
  // Alias entries reference another package id, e.g. "/@scope/pkg@1.2.3".
  const at = version.lastIndexOf('@');
  if (at > 0) {
    const aliasVersion = version.slice(at + 1);
    if (/^\d/.test(aliasVersion)) {
      return aliasVersion.split('_')[0];
    }
  }
  return undefined;
}

// --- npm ----------------------------------------------------------------

/**
 * Resolves a dependency version from a package-lock.json. Supports v2/v3
 * lockfiles (the "packages" map, including workspace-nested node_modules and
 * workspace symlinks) and falls back to the v1 "dependencies" tree.
 */
export function resolveFromNpmLock(lockText: string, relDir: string, name: string): string | undefined {
  let lock: any;
  try {
    lock = JSON.parse(lockText);
  } catch {
    return undefined;
  }
  if (!lock || typeof lock !== 'object') {
    return undefined;
  }

  if (lock.packages && typeof lock.packages === 'object') {
    // Walk from the most deeply nested node_modules up to the root, mirroring
    // Node's resolution: packages/foo/node_modules/<name>, then node_modules/<name>.
    const segments = relDir === '' ? [] : relDir.split('/');
    for (let i = segments.length; i >= 0; i--) {
      const prefix = segments.slice(0, i).join('/');
      const key = `${prefix ? prefix + '/' : ''}node_modules/${name}`;
      const pkg = lock.packages[key];
      if (typeof pkg?.version === 'string') {
        return pkg.version;
      }
      // Workspace symlink: { link: true, resolved: "packages/bar" }
      if (pkg?.link && typeof pkg.resolved === 'string') {
        const target = lock.packages[pkg.resolved];
        if (typeof target?.version === 'string') {
          return target.version;
        }
      }
    }
  }

  const v1Version = lock.dependencies?.[name]?.version;
  return typeof v1Version === 'string' ? v1Version : undefined;
}

// --- yarn ---------------------------------------------------------------

/**
 * Resolves a dependency version from a yarn.lock, supporting both Yarn
 * classic (v1) and Yarn Berry (YAML-ish) formats. Prefers the entry whose
 * descriptor matches the declared range, falling back to any entry for the
 * package name.
 */
export function resolveFromYarnLock(lockText: string, name: string, declaredRange: string): string | undefined {
  const entries = parseYarnLockEntries(lockText);
  const preferred = [
    `${name}@${declaredRange}`,
    `${name}@npm:${declaredRange}`,
  ];
  for (const key of preferred) {
    const version = entries.get(key);
    if (version) {
      return version;
    }
  }
  for (const [key, version] of entries) {
    if (key.startsWith(`${name}@`)) {
      return version;
    }
  }
  return undefined;
}

function parseYarnLockEntries(lockText: string): Map<string, string> {
  const entries = new Map<string, string>();
  let currentKeys: string[] = [];
  for (const line of lockText.split(/\r?\n/)) {
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }
    if (!/^\s/.test(line)) {
      // Header line: one or more comma-separated descriptors ending with ':'.
      currentKeys = line
        .replace(/:\s*$/, '')
        .split(',')
        .map((k) => k.trim().replace(/^"|"$/g, ''));
      continue;
    }
    const match = line.match(/^\s+version:?\s+"?([^"\s]+)"?\s*$/);
    if (match && currentKeys.length > 0) {
      for (const key of currentKeys) {
        entries.set(key, match[1]);
      }
      currentKeys = [];
    }
  }
  return entries;
}

// --- node_modules fallback ------------------------------------------------

async function resolveFromNodeModules(packageDir: string, name: string): Promise<string | undefined> {
  let dir = path.resolve(packageDir);
  for (;;) {
    const manifestPath = path.join(dir, 'node_modules', ...name.split('/'), 'package.json');
    const text = await readFileIfExists(manifestPath);
    if (text !== undefined) {
      try {
        const version = JSON.parse(text).version;
        if (typeof version === 'string') {
          return version;
        }
      } catch {
        // fall through and keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
