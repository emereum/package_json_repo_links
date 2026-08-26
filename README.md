# package.json Repo Links

A VS Code extension that makes dependency names in `package.json` **Ctrl/Cmd-clickable**. Clicking a dependency opens its GitHub repository at the **exact installed version** — not the semver range you declared.

## How it works

When you Ctrl/Cmd-click (or hover) a dependency name, the extension:

1. **Resolves the installed version** from your project's lockfile, walking up the directory tree from the `package.json` (so monorepo workspace packages find the root lockfile):
   - `pnpm-lock.yaml` — lockfile versions 5/6/9, including workspace importers, peer-dependency suffixes (`1.2.3(react@18.2.0)`) and `npm:` aliases
   - `package-lock.json` — v2/v3 `packages` maps (including workspace-nested `node_modules` and workspace symlinks) with a v1 `dependencies` fallback
   - `yarn.lock` — both Yarn classic and Yarn Berry formats, matched against the declared range
   - falls back to reading `node_modules/<name>/package.json` when no lockfile entry exists
2. **Finds the GitHub repository** from the installed package's `repository` field, or from the npm registry's version metadata. All the usual URL shapes are normalized (`git+https`, `git://`, `ssh://`, `git@github.com:owner/repo.git`, `owner/repo` shorthand, `github:` prefixes).
3. **Picks the best GitHub URL**, trying in order:
   - a matching tag: `v<version>`, `<version>`, `<package>@<version>` (and the unscoped `pkg@<version>` variant for scoped packages)
   - the exact publish commit (`gitHead` from the registry) when no tag matches
   - the repository's default branch
4. For monorepo packages that declare `repository.directory` (e.g. Babel, DefinitelyTyped), the link lands directly on the package's folder at that ref.

Scoped packages (`@scope/name`) are fully supported, in lockfiles, registry lookups and tag names alike. All four dependency sections are linkified: `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`.

Resolution is lazy (nothing happens until you activate a link) and cached per session; the cache is invalidated when a lockfile changes.

## Install

**From a registry (recommended — auto-updates):** search for "package.json Repo Links" in the Extensions panel. Cursor and VSCodium install from [Open VSX](https://open-vsx.org/); stock VS Code installs from the VS Code Marketplace if published there.

**From a GitHub Release (manual, no auto-update):**

```bash
curl -LO https://github.com/OWNER/package-json-repo-links/releases/latest/download/package-json-repo-links-0.1.0.vsix
cursor --install-extension package-json-repo-links-0.1.0.vsix   # or `code ...`
```

**From source:**

```bash
pnpm install
pnpm run package
cursor --install-extension package-json-repo-links-*.vsix
```

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `packageJsonRepoLinks.enabled` | `true` | Enable/disable the clickable dependency links. |

## Development

```bash
pnpm install
pnpm run compile   # typecheck with tsc + bundle to dist/ with esbuild
pnpm test          # compile + run unit tests (node:test)
pnpm run package   # build the installable .vsix
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host with the extension loaded.

See `RELEASING.md` in the repository for the one-time publishing setup (Open VSX / VS Code Marketplace tokens) and the release flow.

### Tests

Unit tests cover the VS Code-independent core:

- pnpm lockfiles: v9 workspace importers, v6 top-level sections, peer suffixes, aliases, `link:` deps
- npm lockfiles: v3 workspace hoisting/nesting/symlinks, v1 fallback
- Yarn classic and Berry lockfiles
- scoped package handling end to end
- tag fallback order, publish-commit fallback and default-branch fallback
- repository URL normalization for every common `repository` field shape
