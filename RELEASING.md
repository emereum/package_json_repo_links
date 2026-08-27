# Releasing & Distribution Setup

One-time setup to enable the automated release pipeline in
[`.github/workflows/release.yml`](.github/workflows/release.yml), plus the
per-release flow. The workflow publishes to registries (which gives users
auto-updates) and attaches the `.vsix` to a GitHub Release as a manual-install
fallback.

## One-time setup

### 1. Open VSX (Cursor / VSCodium users — recommended)

Open VSX is the extension registry Cursor uses. Publishing here lets Cursor
users install from the Extensions panel and receive auto-updates. It's free
and doesn't require a Microsoft account.

1. Sign in at [open-vsx.org](https://open-vsx.org/) (GitHub login).
2. Sign the publisher agreement (prompted on first login, under your profile).
3. Create the namespace matching the `publisher` field in `package.json`
   (currently `emereum`): either at
   [open-vsx.org/user-settings/namespaces](https://open-vsx.org/user-settings/namespaces)
   or via CLI: `npx ovsx create-namespace emereum -p <token>`.
4. Generate an access token at
   [open-vsx.org/user-settings/tokens](https://open-vsx.org/user-settings/tokens).
5. In the GitHub repo: **Settings → Secrets and variables → Actions →
   New repository secret**, name it `OVSX_PAT`, paste the token.

### 2. VS Code Marketplace (stock VS Code users — optional)

Only needed if you also want to reach users of Microsoft's VS Code build.

1. Create a publisher named `emereum` at
   [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
   (requires a Microsoft/Azure DevOps account).
2. Create an Azure DevOps Personal Access Token with the **Marketplace →
   Manage** scope (organization: "All accessible organizations").
3. Add it as a repository secret named `VSCE_PAT`.

If either secret is missing, the workflow simply skips that publish step —
the GitHub Release with the `.vsix` is always created.

### 3. Repo housekeeping after pushing to GitHub

- Replace `OWNER` in the README's curl install command with the actual
  GitHub owner/org name (done for
  [`emereum/package_json_repo_links`](https://github.com/emereum/package_json_repo_links)).
- Add a `repository` field to `package.json` (done), then remove
  `--allow-missing-repository` from the `package` script.

## Releasing a new version

1. Bump `version` in `package.json`.
2. Commit the bump.
3. Tag and push — the tag must match the version, the workflow enforces this:

   ```bash
   git tag v0.1.1
   git push && git push --tags
   ```

The workflow then runs tests, packages the `.vsix`, publishes to whichever
registries have secrets configured, and creates a GitHub Release with the
`.vsix` attached. Registry installs auto-update for users; sideloaded `.vsix`
installs do not.
