# UniSat AI

UniSat AI is the foundation repository for developer assistant capabilities. The official repository name remains `unisat-ai`, and the current CLI-first architecture lives on the `main-next` branch.

- `packages/cli`: stable CLI capability layer
- `packages/mcp-server`: MCP layer exposing CLI capabilities and read-only knowledge sources
- `packages/shared-types`: shared structured contracts across CLI and MCP
- `skill./unisat-cli-developer`: installable distribution skill for developer use

Current priorities:

- Primary audience: developer platform and external developers
- First capability set: API interface resolution, raw interface inspection, and direct API calls
- Technical order: stabilize CLI first, expose MCP second, then let skills and agents consume it

## Repo Layout

```text
packages/
  cli/
  mcp-server/
  shared-types/
docs/
  architecture.md
  roadmap-90d.md
scripts/
  doctor.mjs
```

Current branch roles:

- `master`: preserves the historical monorepo structure
- `main-next`: carries the current CLI / MCP / skill architecture

## Current Boundaries

- Docs, OpenAPI, SDKs, and error catalogs remain upstream sources of truth and should not be duplicated here
- The repository-local `swagger/` directory is the default OpenAPI source consumed by CLI and MCP
- `unisat-dev-docs` still owns developer docs, the site, and SDK artifacts
- `sloth-workspace` still owns internal playbooks and agent orchestration

## Local Commands

```bash
node scripts/doctor.mjs
node scripts/smoke.mjs
yarn mcp:server
bash scripts/install-developer-skill.sh
```

## Package Distribution

The repository is now prepared for publishing these npm packages:

- `@unisat/ai-cli`
- `@unisat/ai-mcp-server`

Recommended install flow for external developers after publication:

```bash
npm install -g @unisat/ai-cli @unisat/ai-mcp-server
unisat-ai-cli intro resolve --env bitcoin --query "address brc20 balance list" --format json
```

Or run the MCP server directly with `npx`:

```bash
npx -y @unisat/ai-mcp-server
```

## CLI Downloads

For website downloads, build single-executable archives. Users do not need to install Node.js or npm, and each archive contains one runnable CLI file.

Build the current computer's package:

```bash
npm run package:cli
```

Build a specific platform package on matching host hardware:

```bash
npm run package:cli -- --target windows-x64
```

Outputs are written to `dist/single-cli`:

- `unisat-cli-windows-x64.zip`
- `unisat-cli-linux-x64.tar.gz`
- `unisat-cli-linux-arm64.tar.gz`
- `unisat-cli-macos-x64.tar.gz`
- `unisat-cli-macos-arm64.tar.gz`
- `checksums.txt`

Each archive contains only:

- `unisat-cli.exe` on Windows
- `unisat-ai` on macOS/Linux

End-user flow after download:

```bash
unisat-cli --help
unisat-cli config bitcoin-key --api-key YOUR_BITCOIN_KEY
unisat-cli config fractal-key --api-key YOUR_FRACTAL_KEY
```

Windows users run `unisat-cli.exe` from the extracted zip. macOS and Linux users run `./unisat-cli` from the extracted tarball.

The GitHub Actions workflow `.github/workflows/portable-cli-release.yml` builds all platform archives on tag pushes like `v0.1.0` and uploads them to the GitHub Release.

## Developer Install

If the goal is to let a developer install the skill and get UniSat AI skill, CLI, and MCP wired up in one step, run:

```bash
bash scripts/install-developer-skill.sh
```

The install script will:

- Install the distribution skill into `~/.codex/skills`, `~/.claude/skills`, and `~/.cc-switch/skills`
- Install two local launchers into `~/.local/bin`
  - `unisat-ai-cli`
  - `unisat-ai-mcp-server`
- Print a ready-to-copy MCP config snippet

## Near-term Plan

1. Finalize the compact command surface: `intro resolve`, `intro show`, `api call`
2. Keep improving the MCP server so CLI outputs map cleanly to tool results
3. Dogfood the flow through internal agents and developer-facing entry points

