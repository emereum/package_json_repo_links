import * as vscode from 'vscode';
import { findDependencies } from './core/dependencies';
import { resolveDependencyLink, ResolveEnvironment } from './core/resolveLink';

const CONFIG_SECTION = 'packageJsonRepoLinks';

class DependencyLink extends vscode.DocumentLink {
  constructor(
    range: vscode.Range,
    readonly packageJsonPath: string,
    readonly packageName: string,
    readonly declaredRange: string
  ) {
    super(range);
  }
}

export class PackageJsonLinkProvider implements vscode.DocumentLinkProvider<DependencyLink> {
  private readonly cache = new Map<string, Promise<string>>();

  constructor(private readonly env: ResolveEnvironment) {}

  provideDocumentLinks(document: vscode.TextDocument): DependencyLink[] {
    if (!vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>('enabled', true)) {
      return [];
    }
    return findDependencies(document.getText()).map((entry) => {
      const link = new DependencyLink(
        new vscode.Range(document.positionAt(entry.nameStart), document.positionAt(entry.nameEnd)),
        document.uri.fsPath,
        entry.name,
        entry.declaredRange
      );
      link.tooltip = `Open ${entry.name} on GitHub at the installed version`;
      return link;
    });
  }

  async resolveDocumentLink(link: DependencyLink, token: vscode.CancellationToken): Promise<DependencyLink> {
    const cacheKey = `${link.packageJsonPath}\0${link.packageName}\0${link.declaredRange}`;
    let resolution = this.cache.get(cacheKey);
    if (!resolution) {
      resolution = resolveDependencyLink(link.packageJsonPath, link.packageName, link.declaredRange, this.env).then(
        (resolved) => resolved.url
      );
      this.cache.set(cacheKey, resolution);
      // Don't cache failures.
      resolution.catch(() => this.cache.delete(cacheKey));
    }
    const url = await resolution;
    if (!token.isCancellationRequested) {
      link.target = vscode.Uri.parse(url);
    }
    return link;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

function createNetworkEnvironment(): ResolveEnvironment {
  return {
    fetchJson: async (url) => {
      try {
        const response = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        return response.ok ? await response.json() : undefined;
      } catch {
        return undefined;
      }
    },
    checkUrl: async (url) => {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PackageJsonLinkProvider(createNetworkEnvironment());

  const selector: vscode.DocumentSelector = [
    { language: 'json', pattern: '**/package.json' },
    { language: 'jsonc', pattern: '**/package.json' },
  ];

  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(selector, provider),
    // Lockfiles change on install; drop cached resolutions so links stay accurate.
    vscode.workspace
      .createFileSystemWatcher('**/{pnpm-lock.yaml,package-lock.json,yarn.lock}')
      .onDidChange(() => provider.clearCache())
  );
}

export function deactivate(): void {}
